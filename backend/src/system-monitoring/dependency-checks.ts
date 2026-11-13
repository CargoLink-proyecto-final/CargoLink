import { Socket, connect } from 'node:net';

export type DependencyState = 'UP' | 'DOWN' | 'DEGRADED' | 'NOT_CONFIGURED';

export interface DependencyStatus {
  name: string;
  state: DependencyState;
  /** Tiempo de respuesta del chequeo, si llegó a responder. */
  latencyMs: number | null;
  detail: string | null;
  checkedAt: string;
}

/** Más lento que esto se marca DEGRADED aunque responda. */
export const SLOW_DEPENDENCY_MS = 1500;
const TIMEOUT_MS = 4000;

const elapsed = (start: number) => Math.round(performance.now() - start);

function stateFor(latencyMs: number): DependencyState {
  return latencyMs > SLOW_DEPENDENCY_MS ? 'DEGRADED' : 'UP';
}

/**
 * OSRM público (router.project-osrm.org): lo usa el backend para la distancia
 * de cada viaje completado. Si está caído, los viajes se completan igual pero
 * sin km, y las métricas de consumo dejan de sumar.
 */
export async function checkOsrm(): Promise<DependencyStatus> {
  const start = performance.now();
  const base = { name: 'OSRM (rutas)', checkedAt: new Date().toISOString() };
  try {
    // Una ruta corta y fija dentro de Córdoba: la respuesta es mínima.
    const res = await fetch(
      'https://router.project-osrm.org/route/v1/driving/-64.19,-31.42;-64.18,-31.41?overview=false',
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const latencyMs = elapsed(start);
    if (!res.ok) return { ...base, state: 'DOWN', latencyMs, detail: `HTTP ${res.status}` };
    return { ...base, state: stateFor(latencyMs), latencyMs, detail: null };
  } catch (err) {
    return { ...base, state: 'DOWN', latencyMs: null, detail: (err as Error).name === 'TimeoutError' ? 'Sin respuesta' : (err as Error).message };
  }
}

/**
 * Servidor SMTP: solo se prueba que acepte la conexión TCP, sin autenticar ni
 * mandar nada. Sin SMTP los usuarios nuevos no reciben el mail de
 * verificación y no pueden activar la cuenta.
 */
export async function checkSmtp(env: NodeJS.ProcessEnv = process.env): Promise<DependencyStatus> {
  const base = { name: 'SMTP (mails)', checkedAt: new Date().toISOString() };
  const host = env.SMTP_HOST;
  if (!host || !env.SMTP_USER) {
    return {
      ...base,
      state: 'NOT_CONFIGURED',
      latencyMs: null,
      detail: 'Sin SMTP configurado: los mails van a una casilla de prueba (Ethereal) y no llegan',
    };
  }

  const port = Number(env.SMTP_PORT ?? 587);
  const start = performance.now();
  return new Promise((resolve) => {
    let socket: Socket | null = null;
    const finish = (status: Omit<DependencyStatus, 'name' | 'checkedAt'>) => {
      socket?.destroy();
      resolve({ ...base, ...status });
    };
    socket = connect({ host, port, timeout: TIMEOUT_MS });
    socket.once('connect', () => {
      const latencyMs = elapsed(start);
      finish({ state: stateFor(latencyMs), latencyMs, detail: null });
    });
    socket.once('timeout', () => finish({ state: 'DOWN', latencyMs: null, detail: 'Sin respuesta' }));
    socket.once('error', (err) => finish({ state: 'DOWN', latencyMs: null, detail: err.message }));
  });
}
