'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import BarChart from '@/components/admin/BarChart';
import MetricList from '@/components/admin/MetricList';
import SystemStatusPill from '@/components/admin/SystemStatusPill';
import { adminMetricsApi } from '@/lib/api';
import { EMPTY, formatDuration, formatMs, formatRatio, formatUptime } from '@/lib/adminMetrics';
import { cn } from '@/lib/utils';
import type {
  DependencyState,
  MonitoringRange,
  RouteSummary,
  SystemHealth,
  SystemMetrics,
} from '@/types/adminMetrics';
import { AlertTriangle, Gauge, PowerOff, ShieldCheck, Timer, RefreshCw } from 'lucide-react';

const RANGES: { value: MonitoringRange; label: string }[] = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
];

const DEP_STATE: Record<DependencyState, { label: string; dot: string; text: string }> = {
  UP: { label: 'OK', dot: 'bg-success-600', text: 'text-success-700' },
  DEGRADED: { label: 'Lento', dot: 'bg-warning-600', text: 'text-warning-700' },
  DOWN: { label: 'Caído', dot: 'bg-danger-600', text: 'text-danger-700' },
  NOT_CONFIGURED: { label: 'Sin configurar', dot: 'bg-ink-400', text: 'text-ink-500' },
};

/** Objetivos de referencia del panel (no son un SLA contractual). */
const TARGET_UPTIME = 0.995;
const TARGET_P95_MS = 800;
const TARGET_ERROR_RATE = 0.01;

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function timelineLabel(iso: string, range: MonitoringRange): string {
  const d = new Date(iso);
  if (range === '24h') return `${String(d.getHours()).padStart(2, '0')}h`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export default function SystemMonitoringPage() {
  const [range, setRange] = useState<MonitoringRange>('24h');

  const healthQuery = useQuery({
    queryKey: ['admin-system-health'],
    queryFn: () => adminMetricsApi.getSystemHealth().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const metricsQuery = useQuery({
    queryKey: ['admin-system-metrics', range],
    queryFn: () => adminMetricsApi.getSystemMetrics(range).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const health = healthQuery.data;
  const metrics = metricsQuery.data;
  // Si el endpoint de salud no responde, el backend mismo está caído o
  // inaccesible: eso es lo primero que hay que ver.
  const unreachable = healthQuery.isError;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="eyebrow">Monitoreo</p>
            <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
              Estado del <span className="font-semibold text-primary-700">sistema</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <SystemStatusPill state={unreachable ? 'DOWN' : health?.status ?? null} />
            <button
              type="button"
              onClick={() => {
                void healthQuery.refetch();
                void metricsQuery.refetch();
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12.5px] text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100 disabled:opacity-50"
              disabled={healthQuery.isFetching || metricsQuery.isFetching}
            >
              <RefreshCw size={13} className={cn((healthQuery.isFetching || metricsQuery.isFetching) && 'animate-spin')} />
              Actualizar
            </button>
          </div>
        </div>

        <StatusBanner health={health} unreachable={unreachable} />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-[22px]">Histórico</h2>
          <div role="tablist" aria-label="Rango" className="inline-flex p-1 rounded-lg bg-ink-100">
            {RANGES.map((r) => (
              <button
                key={r.value}
                role="tab"
                aria-selected={range === r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={cn(
                  'h-8 px-3 rounded-md text-[12.5px] font-medium transition',
                  range === r.value ? 'bg-surface-raised text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {metricsQuery.isError ? (
          <div className="card p-5 flex items-center gap-3 text-danger-700">
            <AlertTriangle size={18} />
            <p className="text-[14px]">No se pudo cargar el histórico de monitoreo.</p>
          </div>
        ) : !metrics ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card h-[118px] animate-pulse bg-ink-100/60" />
            ))}
          </div>
        ) : (
          <HistorySections metrics={metrics} range={range} />
        )}

        {health && <LiveSection health={health} />}
      </div>
    </DashboardLayout>
  );
}

function StatusBanner({ health, unreachable }: { health?: SystemHealth; unreachable: boolean }) {
  if (unreachable) {
    return (
      <div className="card p-5 border-danger-600/40 bg-danger-50 flex items-start gap-3">
        <PowerOff size={18} className="text-danger-700 mt-0.5" />
        <div>
          <p className="font-medium text-danger-700">El backend no responde</p>
          <p className="text-[13px] text-danger-700/90 mt-1">
            No se pudo consultar el estado. Revisá el contenedor del backend en el servidor.
          </p>
        </div>
      </div>
    );
  }
  if (!health || health.status === 'OK') return null;

  return (
    <div
      className={cn(
        'card p-5 flex items-start gap-3',
        health.status === 'DOWN' ? 'bg-danger-50 border-danger-600/40' : 'bg-warning-50 border-warning-600/40',
      )}
    >
      <AlertTriangle size={18} className={cn('mt-0.5', health.status === 'DOWN' ? 'text-danger-700' : 'text-warning-700')} />
      <div>
        <p className={cn('font-medium', health.status === 'DOWN' ? 'text-danger-700' : 'text-warning-700')}>
          {health.status === 'DOWN' ? 'Servicio caído' : 'Servicio degradado'}
        </p>
        <ul className="mt-1 text-[13px] text-ink-700 list-disc pl-4 space-y-0.5">
          {health.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function HistorySections({ metrics, range }: { metrics: SystemMetrics; range: MonitoringRange }) {
  const { uptime, requests } = metrics;
  const overall = requests.overall;
  const uptimeLow = uptime.uptimeRatio != null && uptime.uptimeRatio < TARGET_UPTIME;
  const p95High = overall.p95Ms != null && overall.p95Ms > TARGET_P95_MS;
  const errorsHigh = overall.errorRate != null && overall.errorRate > TARGET_ERROR_RATE;
  const measuringSince =
    uptime.measuredFrom && new Date(uptime.measuredFrom).getTime() > new Date(metrics.from).getTime() + 60_000
      ? `Medido desde ${dateTime(uptime.measuredFrom)}`
      : null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Disponibilidad"
          value={formatUptime(uptime.uptimeRatio)}
          hint={
            measuringSince ??
            (uptime.downtimeSeconds > 0 ? `${formatDuration(uptime.downtimeSeconds)} fuera de servicio` : 'Sin cortes')
          }
          icon={ShieldCheck}
          tone={uptimeLow ? 'danger' : 'success'}
        />
        <StatCard
          label="Caídas inesperadas"
          value={uptime.crashes}
          hint={`${uptime.restarts} reinicios en total (incluye deploys)`}
          icon={PowerOff}
          tone={uptime.crashes > 0 ? 'danger' : 'ink'}
        />
        <StatCard
          label="Tiempo de respuesta p95"
          value={formatMs(overall.p95Ms)}
          hint={`Mediana ${formatMs(overall.p50Ms)} · p99 ${formatMs(overall.p99Ms)}`}
          icon={Timer}
          tone={p95High ? 'warning' : 'info'}
        />
        <StatCard
          label="Errores del servidor"
          value={formatRatio(overall.errorRate, 2)}
          hint={`${overall.requests.toLocaleString('es-AR')} requests · 4xx ${formatRatio(overall.clientErrorRate, 1)}`}
          icon={Gauge}
          tone={errorsHigh ? 'danger' : 'ink'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <section className="card p-5">
          <p className="eyebrow">Tráfico</p>
          <h3 className="font-display text-[20px] mt-1 mb-5">Requests y errores 5xx</h3>
          <BarChart
            ariaLabel="Requests por intervalo, con los errores 5xx resaltados"
            tone="ink"
            labelEvery={range === '24h' ? 3 : range === '7d' ? 4 : 5}
            formatValue={(v) => v.toLocaleString('es-AR')}
            points={requests.timeline.map((p) => ({
              label: timelineLabel(p.at, range),
              value: p.requests,
              alert: p.serverErrors,
              title: `${dateTime(p.at)}: ${p.requests} requests, ${p.serverErrors} errores 5xx`,
            }))}
          />
          <p className="mt-3 text-[11.5px] text-ink-500 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink-400" />Requests</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-danger-600" />Errores 5xx</span>
            <span>Un hueco en cero suele ser una caída.</span>
          </p>
        </section>

        <section className="card p-5">
          <p className="eyebrow">Latencia</p>
          <h3 className="font-display text-[20px] mt-1 mb-5">p95 por intervalo</h3>
          <BarChart
            ariaLabel="Percentil 95 del tiempo de respuesta por intervalo"
            tone="info"
            labelEvery={range === '24h' ? 3 : range === '7d' ? 4 : 5}
            formatValue={formatMs}
            points={requests.timeline.map((p) => ({
              label: timelineLabel(p.at, range),
              value: p.p95Ms ?? 0,
              title: `${dateTime(p.at)}: p95 ${formatMs(p.p95Ms)}`,
            }))}
          />
          <p className="mt-3 text-[11.5px] text-ink-500">
            El 95% de los requests respondió en menos de este tiempo. Objetivo: menos de {formatMs(TARGET_P95_MS)}.
          </p>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-200/70">
          <p className="eyebrow">Disponibilidad</p>
          <h3 className="font-display text-[20px] mt-1">Caídas y reinicios</h3>
        </div>
        {uptime.incidents.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-ink-500">Sin cortes en el período.</p>
        ) : (
          <ul className="divide-y divide-ink-200/60">
            {uptime.incidents.map((inc) => (
              <li key={inc.from} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] text-ink-900">
                    {dateTime(inc.from)} → {dateTime(inc.to)}
                  </p>
                  <p className="text-[11.5px] text-ink-500">
                    {inc.kind === 'CRASH'
                      ? 'El proceso se cortó sin apagarse (error, falta de memoria o servidor caído)'
                      : 'Apagado ordenado (deploy o reinicio manual)'}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[13px] tabular-nums text-ink-700">{formatDuration(inc.durationSeconds)}</span>
                  <span
                    className={cn(
                      'text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full ring-1',
                      inc.kind === 'CRASH'
                        ? 'text-danger-700 bg-danger-50 ring-danger-600/20'
                        : 'text-ink-700 bg-ink-100 ring-ink-300',
                    )}
                  >
                    {inc.kind === 'CRASH' ? 'Caída' : 'Planificado'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <RouteTable
          title="Endpoints más lentos"
          empty="Todavía no hay tráfico suficiente para comparar endpoints."
          routes={requests.slowestRoutes}
          metric={(r) => formatMs(r.p95Ms)}
          metricLabel="p95"
        />
        <RouteTable
          title="Endpoints con errores 5xx"
          empty="Ningún endpoint devolvió errores del servidor."
          routes={requests.failingRoutes}
          metric={(r) => `${r.serverErrors} (${formatRatio(r.errorRate, 1)})`}
          metricLabel="5xx"
          danger
        />
      </div>
    </>
  );
}

interface RouteTableProps {
  title: string;
  empty: string;
  routes: RouteSummary[];
  metric: (r: RouteSummary) => string;
  metricLabel: string;
  danger?: boolean;
}

function RouteTable({ title, empty, routes, metric, metricLabel, danger }: RouteTableProps) {
  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-ink-200/70">
        <p className="eyebrow">Por endpoint</p>
        <h3 className="font-display text-[20px] mt-1">{title}</h3>
      </div>
      {routes.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-ink-500">{empty}</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-ink-500">
              <th className="px-5 py-2 font-medium">Endpoint</th>
              <th className="px-3 py-2 font-medium text-right">Requests</th>
              <th className="px-5 py-2 font-medium text-right">{metricLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/60">
            {routes.map((r) => (
              <tr key={`${r.method} ${r.route}`}>
                <td className="px-5 py-2.5 max-w-0 w-full">
                  <span className="font-mono text-[11.5px] text-ink-500 mr-2">{r.method}</span>
                  <span className="font-mono text-[12px] text-ink-900 break-all">{r.route}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{r.requests.toLocaleString('es-AR')}</td>
                <td className={cn('px-5 py-2.5 text-right tabular-nums whitespace-nowrap', danger ? 'text-danger-700' : 'text-ink-900')}>
                  {metric(r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function LiveSection({ health }: { health: SystemHealth }) {
  const heapRatio = health.memory.heapUsedMb / Math.max(1, health.memory.heapLimitMb);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-display text-[22px]">En vivo</h2>
        <p className="text-[11.5px] text-ink-500">Actualizado {dateTime(health.checkedAt)} · se refresca cada 30 s</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-200/70">
            <p className="eyebrow">Dependencias</p>
            <h3 className="font-display text-[20px] mt-1">Base de datos y servicios externos</h3>
          </div>
          <ul className="divide-y divide-ink-200/60">
            <DependencyRow
              name="PostgreSQL"
              state={health.database.up ? 'UP' : 'DOWN'}
              latencyMs={health.database.latencyMs}
              detail={health.database.detail}
            />
            {health.dependencies.map((dep) => (
              <DependencyRow key={dep.name} name={dep.name} state={dep.state} latencyMs={dep.latencyMs} detail={dep.detail} />
            ))}
          </ul>
        </div>

        <div className="card p-5">
          <p className="eyebrow">Proceso</p>
          <h3 className="font-display text-[20px] mt-1 mb-5">Backend</h3>
          <MetricList
            items={[
              {
                label: 'Levantado hace',
                value: formatDuration(health.process.uptimeSeconds),
                hint: health.process.version ? `Versión ${health.process.version}` : `Node ${health.process.nodeVersion}`,
              },
              {
                label: `Errores 5xx (${health.recentRequests.windowMinutes} min)`,
                value: formatRatio(health.recentRequests.errorRate, 1),
                hint: `${health.recentRequests.requests} requests · p95 ${formatMs(health.recentRequests.p95Ms)}`,
                tone: (health.recentRequests.errorRate ?? 0) > TARGET_ERROR_RATE ? 'danger' : 'default',
              },
              {
                label: 'Memoria (heap)',
                value: `${health.memory.heapUsedMb} MB`,
                hint: `de ${health.memory.heapLimitMb} MB · RSS ${health.memory.rssMb} MB`,
                tone: heapRatio > 0.85 ? 'danger' : heapRatio > 0.7 ? 'warning' : 'default',
              },
              {
                label: 'Event loop (p99)',
                value: `${health.eventLoop.p99Ms} ms`,
                hint: `Máx. ${health.eventLoop.maxMs} ms`,
                tone: health.eventLoop.p99Ms > 200 ? 'danger' : health.eventLoop.p99Ms > 50 ? 'warning' : 'default',
              },
              {
                label: 'Chat en tiempo real',
                value: String(health.realtime.connections),
                hint: `${health.realtime.onlineUsers} usuarios conectados`,
              },
              {
                label: 'Último latido',
                value: health.process.lastHeartbeatAt
                  ? formatDuration((Date.parse(health.checkedAt) - Date.parse(health.process.lastHeartbeatAt)) / 1000)
                  : EMPTY,
                hint: 'Se registra cada minuto',
              },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function DependencyRow({
  name,
  state,
  latencyMs,
  detail,
}: {
  name: string;
  state: DependencyState;
  latencyMs: number | null;
  detail: string | null;
}) {
  const s = DEP_STATE[state];
  return (
    <li className="flex items-start justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink-900 flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full shrink-0', s.dot)} aria-hidden />
          {name}
        </p>
        {detail && <p className="text-[11.5px] text-ink-500 mt-0.5 break-words">{detail}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={cn('text-[12.5px] font-medium', s.text)}>{s.label}</p>
        {latencyMs != null && <p className="text-[11.5px] text-ink-500 tabular-nums">{formatMs(latencyMs)}</p>}
      </div>
    </li>
  );
}
