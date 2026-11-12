/** Forma mínima de una fila de `uptime_sessions` para calcular disponibilidad. */
export interface SessionForUptime {
  startedAt: Date;
  lastSeenAt: Date;
  endedAt: Date | null;
}

export type IncidentKind = 'CRASH' | 'PLANNED';

export interface DowntimeIncident {
  /** Último momento en que se sabe que el backend estaba vivo. */
  from: Date;
  /** Arranque del proceso siguiente. */
  to: Date;
  durationSeconds: number;
  /**
   * PLANNED: el proceso anterior se apagó en orden (deploy, restart manual).
   * CRASH: murió sin avisar (excepción no capturada, OOM, VPS o Docker caído).
   */
  kind: IncidentKind;
}

export interface UptimeSummary {
  /** Disponibilidad en el rango medido, 0..1. null si no hay datos. */
  uptimeRatio: number | null;
  /** Segundos caído dentro del rango (planificados + no planificados). */
  downtimeSeconds: number;
  /** Segundos caído sin aviso — el número que de verdad preocupa. */
  unplannedDowntimeSeconds: number;
  crashes: number;
  restarts: number;
  /**
   * Desde cuándo se mide realmente: el inicio del rango o el primer arranque
   * registrado, lo que sea posterior. Antes de existir el monitoreo no hay
   * datos, y contarlo como caído inventaría incidentes.
   */
  measuredFrom: Date | null;
  incidents: DowntimeIncident[];
}

/**
 * Huecos más cortos que esto no se cuentan como caída: entre el último
 * latido y el apagado real puede pasar hasta un intervalo de heartbeat, y no
 * queremos que cada deploy sin corte visible aparezca como incidente.
 */
export const MIN_INCIDENT_SECONDS = 5;

const seconds = (ms: number) => Math.round(ms / 1000);

/**
 * Reconstruye las caídas a partir de las sesiones del proceso. Función pura.
 *
 * Una caída es el hueco entre el fin de una sesión (su `endedAt`, o si murió
 * sin avisar, su último latido) y el arranque de la siguiente. Precisión: en un
 * crash el proceso pudo seguir vivo hasta un intervalo de heartbeat después del
 * último latido, así que la duración es una cota superior.
 *
 * `now` cierra el rango: la sesión actual es la que está respondiendo esta
 * consulta, así que está viva aunque su último latido tenga unos segundos.
 */
export function computeUptime(
  sessions: SessionForUptime[],
  rangeFrom: Date,
  now: Date,
): UptimeSummary {
  const sorted = [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  if (sorted.length === 0) {
    return {
      uptimeRatio: null,
      downtimeSeconds: 0,
      unplannedDowntimeSeconds: 0,
      crashes: 0,
      restarts: 0,
      measuredFrom: null,
      incidents: [],
    };
  }

  const measuredFrom = new Date(Math.max(rangeFrom.getTime(), sorted[0].startedAt.getTime()));
  const incidents: DowntimeIncident[] = [];
  let restarts = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    // Un hueco que terminó antes del rango no cuenta; uno que lo cruza, sí
    // (por eso se mira el arranque de `next`, no el fin de `prev`).
    if (next.startedAt <= measuredFrom) continue;
    restarts += 1;
    const lastAlive = prev.endedAt ?? prev.lastSeenAt;

    // Recortar al rango: una caída que empezó antes del rango cuenta solo la
    // parte que cae adentro.
    const from = new Date(Math.max(lastAlive.getTime(), measuredFrom.getTime()));
    const to = new Date(Math.min(next.startedAt.getTime(), now.getTime()));
    const durationSeconds = seconds(to.getTime() - from.getTime());
    if (durationSeconds < MIN_INCIDENT_SECONDS) continue;

    incidents.push({
      from,
      to,
      durationSeconds,
      kind: prev.endedAt ? 'PLANNED' : 'CRASH',
    });
  }

  const downtimeSeconds = incidents.reduce((sum, inc) => sum + inc.durationSeconds, 0);
  const unplannedDowntimeSeconds = incidents
    .filter((inc) => inc.kind === 'CRASH')
    .reduce((sum, inc) => sum + inc.durationSeconds, 0);
  const windowSeconds = seconds(now.getTime() - measuredFrom.getTime());

  return {
    uptimeRatio: windowSeconds > 0 ? Math.max(0, 1 - downtimeSeconds / windowSeconds) : null,
    downtimeSeconds,
    unplannedDowntimeSeconds,
    crashes: incidents.filter((inc) => inc.kind === 'CRASH').length,
    restarts,
    measuredFrom,
    // Más reciente primero: es lo que el admin quiere ver arriba.
    incidents: incidents.reverse(),
  };
}
