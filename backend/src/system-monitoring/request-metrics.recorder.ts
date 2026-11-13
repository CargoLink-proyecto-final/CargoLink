import { Injectable } from '@nestjs/common';
import { bucketIndex } from './latency-histogram';
import { RequestMetricRow, RequestStats, addStats, emptyStats } from './request-metrics';

export const MINUTE_MS = 60_000;

/**
 * Acumula en memoria los requests del minuto en curso, agrupados por endpoint.
 * El `UptimeService` los vacía a la DB una vez por minuto (`drain`).
 *
 * Se guarda en memoria y no request por request en la DB a propósito: escribir
 * una fila por request duplicaría la carga de la base solo para medirla.
 * El costo es que, si el proceso muere sin apagarse en orden, se pierde como
 * mucho el último minuto de métricas.
 */
@Injectable()
export class RequestMetricsRecorder {
  private readonly pending = new Map<string, RequestMetricRow>();

  record(method: string, route: string, status: number, durationMs: number, at = new Date()): void {
    const bucket = new Date(Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS);
    const key = `${bucket.getTime()}|${method}|${route}`;

    let row = this.pending.get(key);
    if (!row) {
      row = { bucket, method, route, ...emptyStats() };
      this.pending.set(key, row);
    }

    row.count += 1;
    if (status >= 500) row.serverErrors += 1;
    else if (status >= 400) row.clientErrors += 1;
    row.totalMs += durationMs;
    row.maxMs = Math.max(row.maxMs, durationMs);
    row.histogram[bucketIndex(durationMs)] += 1;
  }

  /**
   * Saca y devuelve los minutos ya cerrados (anteriores a `now`). Con
   * `includeCurrent` también el minuto en curso — para el apagado, cuando no va
   * a haber otra oportunidad de guardarlo.
   */
  drain(now = new Date(), includeCurrent = false): RequestMetricRow[] {
    const currentBucket = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
    const drained: RequestMetricRow[] = [];

    for (const [key, row] of this.pending) {
      if (includeCurrent || row.bucket.getTime() < currentBucket) {
        drained.push(row);
        this.pending.delete(key);
      }
    }
    return drained;
  }

  /** Lo acumulado que todavía no se guardó, para el snapshot en vivo. */
  pendingStats(): RequestStats {
    const acc = emptyStats();
    for (const row of this.pending.values()) addStats(acc, row);
    return acc;
  }
}
