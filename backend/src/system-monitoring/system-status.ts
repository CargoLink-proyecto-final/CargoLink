import { DependencyStatus } from './dependency-checks';

export type OverallState = 'OK' | 'DEGRADED' | 'DOWN';

/** Umbrales a partir de los cuales una señal se considera problema. */
export const THRESHOLDS = {
  /** 5xx sobre el total de los últimos 15 minutos. */
  errorRate: 0.05,
  /** p99 del retraso del event loop: arriba de esto el server responde a los saltos. */
  eventLoopP99Ms: 200,
  /** Heap usado sobre el límite del heap de V8. */
  heapUsedRatio: 0.85,
  /** Latidos fallidos seguidos (la DB no acepta escrituras). */
  heartbeatFailures: 2,
} as const;

export interface StatusSignals {
  databaseUp: boolean;
  dependencies: DependencyStatus[];
  /** null si no hubo tráfico en la ventana. */
  recentErrorRate: number | null;
  eventLoopP99Ms: number;
  heapUsedRatio: number;
  heartbeatFailures: number;
}

export interface OverallStatus {
  state: OverallState;
  /** Motivos legibles, en el orden en que conviene mirarlos. */
  reasons: string[];
}

const pct = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;

/**
 * Resume las señales en un semáforo. Función pura.
 *
 * DOWN solo cuando la DB no responde: sin DB no funciona ningún flujo. Todo lo
 * demás (un servicio externo caído, errores o lentitud) degrada pero el
 * backend sigue atendiendo.
 */
export function computeOverallStatus(signals: StatusSignals): OverallStatus {
  if (!signals.databaseUp) {
    return { state: 'DOWN', reasons: ['La base de datos no responde'] };
  }

  const reasons: string[] = [];

  if (signals.recentErrorRate != null && signals.recentErrorRate > THRESHOLDS.errorRate) {
    reasons.push(`${pct(signals.recentErrorRate)} de errores 5xx en los últimos 15 minutos`);
  }
  if (signals.heartbeatFailures >= THRESHOLDS.heartbeatFailures) {
    reasons.push(`${signals.heartbeatFailures} latidos seguidos sin poder escribir en la DB`);
  }
  for (const dep of signals.dependencies) {
    if (dep.state === 'DOWN') reasons.push(`${dep.name} no responde`);
    else if (dep.state === 'DEGRADED') reasons.push(`${dep.name} responde lento (${dep.latencyMs} ms)`);
  }
  if (signals.eventLoopP99Ms > THRESHOLDS.eventLoopP99Ms) {
    reasons.push(`Event loop trabado: p99 de ${Math.round(signals.eventLoopP99Ms)} ms`);
  }
  if (signals.heapUsedRatio > THRESHOLDS.heapUsedRatio) {
    reasons.push(`Memoria al ${pct(signals.heapUsedRatio)} del límite`);
  }

  return { state: reasons.length > 0 ? 'DEGRADED' : 'OK', reasons };
}
