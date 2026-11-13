/**
 * Límites superiores (ms, inclusive) de cada bucket del histograma de
 * latencias. Hay un bucket extra al final para todo lo que supere el último
 * límite. Cambiar esta lista invalida los histogramas ya guardados en
 * `request_metrics`: si hace falta, agregar límites al final, nunca en el medio.
 */
export const LATENCY_BOUNDS_MS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

export const HISTOGRAM_SIZE = LATENCY_BOUNDS_MS.length + 1;

export function emptyHistogram(): number[] {
  return new Array(HISTOGRAM_SIZE).fill(0);
}

export function bucketIndex(ms: number): number {
  const i = LATENCY_BOUNDS_MS.findIndex((bound) => ms <= bound);
  return i === -1 ? LATENCY_BOUNDS_MS.length : i;
}

/** Suma `b` dentro de `a` (muta y devuelve `a`). Tolera largos distintos. */
export function mergeHistogramInto(a: number[], b: readonly number[]): number[] {
  for (let i = 0; i < b.length; i++) a[i] = (a[i] ?? 0) + b[i];
  return a;
}

/**
 * Percentil aproximado (0 < p <= 1) a partir del histograma, interpolando
 * linealmente dentro del bucket donde cae. Es la misma técnica que usa
 * Prometheus con `histogram_quantile`: el error está acotado por el ancho del
 * bucket, suficiente para ver si el p95 está en 80 ms o en 2 s.
 *
 * El bucket abierto del final no tiene techo: si el percentil cae ahí se
 * devuelve `maxMs` (el máximo real observado) en vez de inventar un valor.
 * Devuelve null si el histograma está vacío.
 */
export function percentileFromHistogram(
  histogram: readonly number[],
  p: number,
  maxMs: number,
): number | null {
  const total = histogram.reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  const target = p * total;
  let cumulative = 0;

  for (let i = 0; i < histogram.length; i++) {
    const count = histogram[i];
    if (count === 0) continue;
    if (cumulative + count >= target) {
      if (i >= LATENCY_BOUNDS_MS.length) return Math.round(maxMs);
      const lower = i === 0 ? 0 : LATENCY_BOUNDS_MS[i - 1];
      const upper = Math.min(LATENCY_BOUNDS_MS[i], Math.max(maxMs, lower));
      const fraction = (target - cumulative) / count;
      return Math.round(lower + (upper - lower) * fraction);
    }
    cumulative += count;
  }

  return Math.round(maxMs);
}
