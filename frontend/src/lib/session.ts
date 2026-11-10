import axios from 'axios';
import type { AuthResponse } from '@/types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002/api';

// Claves de sessionStorage (sesión por pestaña, ver store/auth.ts).
export const SESSION_KEYS = {
  accessToken: 'token',
  refreshToken: 'refreshToken',
  user: 'user',
} as const;

// Instancia sin interceptores: el refresh no puede pasar por el interceptor que
// lo dispara, o un 401 del propio refresh entraría en loop.
const bare = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

/** Error de red/servidor durante el refresh: la sesión puede seguir siendo válida. */
export class RefreshUnavailableError extends Error {}

let inflight: Promise<AuthResponse | null> | null = null;

/**
 * Pide un access token nuevo con el refresh token de esta pestaña.
 *
 * - Devuelve la sesión nueva (el refresh token también rota).
 * - Devuelve `null` si el backend rechazó el refresh token: la sesión murió.
 * - Tira `RefreshUnavailableError` si no se pudo hablar con el backend; en ese
 *   caso NO hay que desloguear (sería echar al usuario por un corte de red).
 *
 * Las llamadas concurrentes comparten la misma promesa: el refresh token es de
 * un solo uso y si dos requests lo canjearan a la vez, el backend lo tomaría
 * como reuso y cerraría la sesión.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!inflight) {
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function doRefresh(): Promise<AuthResponse | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = sessionStorage.getItem(SESSION_KEYS.refreshToken);
  if (!refreshToken) return null;
  try {
    const { data } = await bare.post<AuthResponse>('/auth/refresh', { refreshToken });
    return data;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 400 || status === 401) return null;
    throw new RefreshUnavailableError('No se pudo renovar la sesión');
  }
}

/** Revoca la sesión en el backend al cerrar sesión. Best effort: no bloquea el logout. */
export function revokeSession(refreshToken: string | null): void {
  if (!refreshToken) return;
  bare.post('/auth/logout', { refreshToken }).catch(() => undefined);
}

/** `exp` del JWT en ms, o null si no se puede leer. No valida la firma. */
export function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** true si el access token vence dentro del margen (o ya venció). */
export function expiresSoon(token: string, marginMs = 30_000): boolean {
  const exp = tokenExpiry(token);
  return exp !== null && exp - marginMs <= Date.now();
}
