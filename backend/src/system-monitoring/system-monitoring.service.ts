import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { monitorEventLoopDelay, IntervalHistogram } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../push/presence.service';
import { DependencyStatus, checkOsrm, checkSmtp } from './dependency-checks';
import { MINUTE_MS, RequestMetricsRecorder } from './request-metrics.recorder';
import { aggregateRequestMetrics, addStats, summarize } from './request-metrics';
import { computeOverallStatus } from './system-status';
import { UptimeService } from './uptime.service';
import { computeUptime } from './uptime';

export type MonitoringRange = '24h' | '7d' | '30d';

const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Largo del rango y granularidad del gráfico para cada opción del panel. */
export const RANGES: Record<MonitoringRange, { lengthMs: number; stepMs: number }> = {
  '24h': { lengthMs: DAY_MS, stepMs: HOUR_MS },
  '7d': { lengthMs: 7 * DAY_MS, stepMs: 6 * HOUR_MS },
  '30d': { lengthMs: 30 * DAY_MS, stepMs: DAY_MS },
};

/** Los chequeos externos se cachean: el panel refresca seguido y OSRM es un servicio público. */
const DEPENDENCY_CACHE_MS = MINUTE_MS;
const RECENT_WINDOW_MS = 15 * MINUTE_MS;

@Injectable()
export class SystemMonitoringService implements OnModuleDestroy {
  private readonly eventLoop: IntervalHistogram = monitorEventLoopDelay({ resolution: 20 });
  private dependencyCache: { at: number; value: DependencyStatus[] } | null = null;

  constructor(
    private prisma: PrismaService,
    private recorder: RequestMetricsRecorder,
    private uptime: UptimeService,
    private presence: PresenceService,
  ) {
    this.eventLoop.enable();
  }

  onModuleDestroy() {
    this.eventLoop.disable();
  }

  /** Snapshot en vivo: ¿el sistema está bien ahora mismo? */
  async getHealth(now = new Date()) {
    const [database, dependencies, recent] = await Promise.all([
      this.pingDatabase(),
      this.checkDependencies(),
      this.recentRequests(now),
    ]);

    const memory = process.memoryUsage();
    const heapLimit = getHeapStatistics().heap_size_limit;
    // Retraso del event loop desde la consulta anterior (se resetea al leer).
    const eventLoop = {
      p50Ms: Math.round(this.eventLoop.percentile(50) / 1e6),
      p99Ms: Math.round(this.eventLoop.percentile(99) / 1e6),
      maxMs: Math.round(this.eventLoop.max / 1e6),
    };
    this.eventLoop.reset();

    const heartbeat = this.uptime.heartbeatStatus();
    const status = computeOverallStatus({
      databaseUp: database.up,
      dependencies,
      recentErrorRate: recent.errorRate,
      eventLoopP99Ms: eventLoop.p99Ms,
      heapUsedRatio: memory.heapUsed / heapLimit,
      heartbeatFailures: heartbeat.consecutiveFailures,
    });

    return {
      status: status.state,
      reasons: status.reasons,
      checkedAt: now.toISOString(),
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        startedAt: new Date(now.getTime() - process.uptime() * 1000).toISOString(),
        version: process.env.APP_VERSION || null,
        nodeVersion: process.version,
        lastHeartbeatAt: heartbeat.lastHeartbeatAt?.toISOString() ?? null,
      },
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapLimitMb: Math.round(heapLimit / 1024 / 1024),
      },
      eventLoop,
      database,
      dependencies,
      realtime: this.presence.stats(),
      recentRequests: { windowMinutes: RECENT_WINDOW_MS / MINUTE_MS, ...recent },
    };
  }

  /** Histórico: disponibilidad, caídas y tiempos de respuesta del rango. */
  async getMetrics(range: MonitoringRange, now = new Date()) {
    const { lengthMs, stepMs } = RANGES[range];
    const from = new Date(now.getTime() - lengthMs);

    const [sessions, rows] = await Promise.all([
      // La sesión anterior al rango también hace falta: el hueco entre ella y
      // la primera del rango puede caer adentro.
      this.prisma.uptimeSession.findMany({
        where: { lastSeenAt: { gte: from } },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.requestMetric.findMany({
        where: { bucket: { gte: from } },
        orderBy: { bucket: 'asc' },
      }),
    ]);
    const previous = await this.prisma.uptimeSession.findFirst({
      where: { startedAt: { lt: sessions[0]?.startedAt ?? now } },
      orderBy: { startedAt: 'desc' },
    });

    return {
      range,
      from: from.toISOString(),
      to: now.toISOString(),
      stepMinutes: stepMs / MINUTE_MS,
      uptime: computeUptime(previous ? [previous, ...sessions] : sessions, from, now),
      requests: aggregateRequestMetrics(rows, from, now, stepMs),
    };
  }

  private async pingDatabase(): Promise<{ up: boolean; latencyMs: number | null; detail: string | null }> {
    const start = performance.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { up: true, latencyMs: Math.round(performance.now() - start), detail: null };
    } catch (err) {
      return { up: false, latencyMs: null, detail: (err as Error).message.split('\n')[0] };
    }
  }

  private async checkDependencies(): Promise<DependencyStatus[]> {
    if (this.dependencyCache && Date.now() - this.dependencyCache.at < DEPENDENCY_CACHE_MS) {
      return this.dependencyCache.value;
    }
    const value = await Promise.all([checkOsrm(), checkSmtp()]);
    this.dependencyCache = { at: Date.now(), value };
    return value;
  }

  /**
   * Últimos 15 minutos: lo ya guardado en la DB más lo que todavía está en
   * memoria sin guardar. Si la DB no responde, solo lo de memoria.
   */
  private async recentRequests(now: Date) {
    const stats = this.recorder.pendingStats();
    try {
      const rows = await this.prisma.requestMetric.findMany({
        where: { bucket: { gte: new Date(now.getTime() - RECENT_WINDOW_MS) } },
      });
      for (const row of rows) addStats(stats, row);
    } catch {
      // Sin DB el semáforo ya va a estar en DOWN; no hace falta otro error.
    }
    return summarize(stats);
  }
}
