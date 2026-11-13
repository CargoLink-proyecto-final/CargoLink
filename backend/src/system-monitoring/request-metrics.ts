import { emptyHistogram, mergeHistogramInto, percentileFromHistogram } from './latency-histogram';

/** Forma de una fila de `request_metrics` (un minuto × endpoint). */
export interface RequestMetricRow {
  bucket: Date;
  method: string;
  route: string;
  count: number;
  clientErrors: number;
  serverErrors: number;
  totalMs: number;
  maxMs: number;
  histogram: number[];
}

/** Acumulador de requests: el mismo para un minuto, un endpoint o un rango. */
export interface RequestStats {
  count: number;
  clientErrors: number;
  serverErrors: number;
  totalMs: number;
  maxMs: number;
  histogram: number[];
}

export function emptyStats(): RequestStats {
  return { count: 0, clientErrors: 0, serverErrors: 0, totalMs: 0, maxMs: 0, histogram: emptyHistogram() };
}

export function addStats(acc: RequestStats, row: Omit<RequestStats, 'histogram'> & { histogram: readonly number[] }): RequestStats {
  acc.count += row.count;
  acc.clientErrors += row.clientErrors;
  acc.serverErrors += row.serverErrors;
  acc.totalMs += row.totalMs;
  acc.maxMs = Math.max(acc.maxMs, row.maxMs);
  mergeHistogramInto(acc.histogram, row.histogram);
  return acc;
}

export interface LatencySummary {
  requests: number;
  /** 5xx / requests. null sin requests. */
  errorRate: number | null;
  /** 4xx / requests. null sin requests. */
  clientErrorRate: number | null;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
}

export function summarize(stats: RequestStats): LatencySummary {
  const n = stats.count;
  return {
    requests: n,
    errorRate: n ? stats.serverErrors / n : null,
    clientErrorRate: n ? stats.clientErrors / n : null,
    avgMs: n ? Math.round(stats.totalMs / n) : null,
    p50Ms: percentileFromHistogram(stats.histogram, 0.5, stats.maxMs),
    p95Ms: percentileFromHistogram(stats.histogram, 0.95, stats.maxMs),
    p99Ms: percentileFromHistogram(stats.histogram, 0.99, stats.maxMs),
    maxMs: n ? Math.round(stats.maxMs) : null,
  };
}

export interface RouteSummary extends LatencySummary {
  method: string;
  route: string;
  serverErrors: number;
}

export interface TimelinePoint {
  /** Inicio del intervalo (ISO). */
  at: string;
  requests: number;
  serverErrors: number;
  p95Ms: number | null;
}

export interface RequestMetricsReport {
  overall: LatencySummary;
  /** Endpoints más lentos por p95 (con un mínimo de tráfico para que sea representativo). */
  slowestRoutes: RouteSummary[];
  /** Endpoints con más respuestas 5xx. */
  failingRoutes: RouteSummary[];
  timeline: TimelinePoint[];
}

/** Por debajo de esto un p95 es ruido: con 3 requests "el más lento" es cualquiera. */
export const MIN_REQUESTS_FOR_RANKING = 20;
const TOP_ROUTES = 8;

/**
 * Agrega las filas de `request_metrics` de un rango. Función pura.
 *
 * `stepMs` define la granularidad del timeline (1 h para 24 h, 1 día para 30
 * días). Los intervalos sin tráfico se devuelven en cero para que el gráfico
 * no saltee huecos — un hueco en cero es justamente lo que se ve en una caída.
 */
export function aggregateRequestMetrics(
  rows: RequestMetricRow[],
  from: Date,
  to: Date,
  stepMs: number,
): RequestMetricsReport {
  const overall = emptyStats();
  const byRoute = new Map<string, { method: string; route: string; stats: RequestStats }>();

  const start = Math.floor(from.getTime() / stepMs) * stepMs;
  const steps = Math.max(1, Math.ceil((to.getTime() - start) / stepMs));
  const timeline = Array.from({ length: steps }, () => emptyStats());

  for (const row of rows) {
    addStats(overall, row);

    const key = `${row.method} ${row.route}`;
    let entry = byRoute.get(key);
    if (!entry) {
      entry = { method: row.method, route: row.route, stats: emptyStats() };
      byRoute.set(key, entry);
    }
    addStats(entry.stats, row);

    const idx = Math.floor((row.bucket.getTime() - start) / stepMs);
    if (idx >= 0 && idx < steps) addStats(timeline[idx], row);
  }

  const routes: RouteSummary[] = [...byRoute.values()].map(({ method, route, stats }) => ({
    method,
    route,
    serverErrors: stats.serverErrors,
    ...summarize(stats),
  }));

  return {
    overall: summarize(overall),
    slowestRoutes: routes
      .filter((r) => r.requests >= MIN_REQUESTS_FOR_RANKING && r.p95Ms != null)
      .sort((a, b) => (b.p95Ms ?? 0) - (a.p95Ms ?? 0))
      .slice(0, TOP_ROUTES),
    failingRoutes: routes
      .filter((r) => r.serverErrors > 0)
      .sort((a, b) => b.serverErrors - a.serverErrors)
      .slice(0, TOP_ROUTES),
    timeline: timeline.map((stats, i) => ({
      at: new Date(start + i * stepMs).toISOString(),
      requests: stats.count,
      serverErrors: stats.serverErrors,
      p95Ms: percentileFromHistogram(stats.histogram, 0.95, stats.maxMs),
    })),
  };
}
