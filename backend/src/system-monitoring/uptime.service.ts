import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MINUTE_MS, RequestMetricsRecorder } from './request-metrics.recorder';
import { RequestMetricRow, addStats } from './request-metrics';

/** Cada cuánto se actualiza el latido y se guardan las métricas de requests. */
export const HEARTBEAT_MS = MINUTE_MS;
/** Retención de `request_metrics`: el panel muestra como máximo 30 días. */
export const REQUEST_METRICS_RETENTION_DAYS = 35;
const PRUNE_EVERY_MS = 60 * MINUTE_MS;

/**
 * Registra la vida del proceso del backend para poder reconstruir caídas:
 * una fila en `uptime_sessions` al arrancar, un latido por minuto y el cierre
 * en un apagado ordenado. Además vacía a la DB las métricas de requests que
 * acumula `RequestMetricsRecorder`.
 *
 * Usa `setInterval` y no `@nestjs/schedule` para no sumar una dependencia por
 * una sola tarea periódica.
 */
@Injectable()
export class UptimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(UptimeService.name);
  private sessionId: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastPruneAt = 0;
  /** Latidos seguidos que fallaron (DB inaccesible). Lo expone el health. */
  private consecutiveFailures = 0;
  private lastHeartbeatAt: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private recorder: RequestMetricsRecorder,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const session = await this.prisma.uptimeSession.create({
        data: { version: process.env.APP_VERSION || null },
      });
      this.sessionId = session.id;
      this.lastHeartbeatAt = session.startedAt;
    } catch (err) {
      // El monitoreo nunca debe impedir que la app arranque.
      this.logger.error(`No se pudo registrar el arranque: ${(err as Error).message}`);
    }

    this.timer = setInterval(() => void this.tick(), HEARTBEAT_MS);
    // No retener el event loop: el proceso tiene que poder salir aunque el
    // timer siga programado.
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    try {
      await this.flush(new Date(), true);
      if (this.sessionId) {
        const now = new Date();
        await this.prisma.uptimeSession.update({
          where: { id: this.sessionId },
          data: { lastSeenAt: now, endedAt: now },
        });
      }
    } catch (err) {
      this.logger.error(`No se pudo registrar el apagado: ${(err as Error).message}`);
    }
  }

  /** Estado del latido para el snapshot de salud. */
  heartbeatStatus() {
    return {
      sessionId: this.sessionId,
      lastHeartbeatAt: this.lastHeartbeatAt,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  async tick(now = new Date()): Promise<void> {
    try {
      if (this.sessionId) {
        await this.prisma.uptimeSession.update({
          where: { id: this.sessionId },
          data: { lastSeenAt: now },
        });
      } else {
        // El arranque no pudo registrarse (DB caída al iniciar): reintentar,
        // así una DB que tarda en levantar no deja al proceso sin sesión.
        const session = await this.prisma.uptimeSession.create({
          data: { startedAt: now, lastSeenAt: now, version: process.env.APP_VERSION || null },
        });
        this.sessionId = session.id;
      }
      this.lastHeartbeatAt = now;
      this.consecutiveFailures = 0;

    } catch (err) {
      this.consecutiveFailures += 1;
      this.logger.warn(`Heartbeat falló (${this.consecutiveFailures} seguidos): ${(err as Error).message}`);
      return;
    }

    await this.flush(now, false);
    try {
      await this.pruneIfDue(now);
    } catch (err) {
      this.logger.warn(`No se pudieron purgar métricas viejas: ${(err as Error).message}`);
    }
  }

  /**
   * Guarda los minutos cerrados. Si el minuto ya existe en la DB (un reinicio
   * dentro del mismo minuto: el proceso viejo guardó al apagarse y el nuevo
   * guarda después), se suman — no se pisa ni se descarta.
   */
  async flush(now: Date, includeCurrent: boolean): Promise<void> {
    const rows = this.recorder.drain(now, includeCurrent);
    if (rows.length === 0) return;

    try {
      const existing = await this.prisma.requestMetric.findMany({
        where: { OR: rows.map(({ bucket, method, route }) => ({ bucket, method, route })) },
      });
      const keyOf = (r: { bucket: Date; method: string; route: string }) =>
        `${r.bucket.getTime()}|${r.method}|${r.route}`;
      const existingByKey = new Map(existing.map((r) => [keyOf(r), r]));

      const toCreate = rows.filter((r) => !existingByKey.has(keyOf(r)));
      if (toCreate.length > 0) {
        await this.prisma.requestMetric.createMany({ data: toCreate, skipDuplicates: true });
      }
      for (const row of rows) {
        const current = existingByKey.get(keyOf(row));
        if (current) await this.mergeInto(current, row);
      }
    } catch (err) {
      // Si la DB no está, las métricas de esos minutos se pierden: retenerlas
      // en memoria para reintentar podría crecer sin límite durante una caída.
      this.logger.warn(`No se pudieron guardar ${rows.length} métricas de requests: ${(err as Error).message}`);
    }
  }

  private async mergeInto(
    existing: RequestMetricRow & { id: string },
    row: RequestMetricRow,
  ): Promise<void> {
    const merged = addStats({ ...existing, histogram: [...existing.histogram] }, row);
    await this.prisma.requestMetric.update({
      where: { id: existing.id },
      data: {
        count: merged.count,
        clientErrors: merged.clientErrors,
        serverErrors: merged.serverErrors,
        totalMs: merged.totalMs,
        maxMs: merged.maxMs,
        histogram: merged.histogram,
      },
    });
  }

  private async pruneIfDue(now: Date): Promise<void> {
    if (now.getTime() - this.lastPruneAt < PRUNE_EVERY_MS) return;
    this.lastPruneAt = now.getTime();
    const cutoff = new Date(now.getTime() - REQUEST_METRICS_RETENTION_DAYS * 24 * 60 * MINUTE_MS);
    await this.prisma.requestMetric.deleteMany({ where: { bucket: { lt: cutoff } } });
  }
}
