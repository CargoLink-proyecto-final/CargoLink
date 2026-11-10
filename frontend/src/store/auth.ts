import { create } from 'zustand';
import { User } from '@/types';
import { queryClient } from '@/lib/queryClient';
import { revokeSession, SESSION_KEYS } from '@/lib/session';

type AuthUser = Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, token: string, refreshToken: string) => void;
  // Reemplaza los tokens tras un refresh (sin limpiar la caché de queries:
  // es la misma sesión del mismo usuario).
  setSession: (user: AuthUser, token: string, refreshToken: string) => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  logout: () => void;
  hydrate: () => void;
}

// Sesión POR PESTAÑA. Usamos sessionStorage (no localStorage) porque
// sessionStorage está aislado por browsing context: dos cuentas abiertas en dos
// pestañas del mismo navegador NO comparten token ni usuario. localStorage es
// compartido por origen, y eso causaba que el segundo login pisara el token del
// primero → una pestaña renderizaba un rol (en memoria) mientras la request
// viajaba con el token de la otra cuenta (de localStorage) → 403 cruzado.
const storage = {
  get(key: string): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(key);
  },
  set(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(key, value);
  },
  remove(key: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(key);
  },
};

function clearStorage(): void {
  storage.remove(SESSION_KEYS.accessToken);
  storage.remove(SESSION_KEYS.refreshToken);
  storage.remove(SESSION_KEYS.user);
}

// Decodifica el payload de un JWT sin validar la firma (la firma la valida el
// backend). Solo lo usamos para verificar que el usuario guardado coincide con
// el token que efectivamente se manda: el rol que rendea la UI nunca puede
// divergir del rol que viaja en la request.
function parseJwt(token: string): { sub?: string; role?: string; exp?: number } | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: (user, token, refreshToken) => {
    storage.set(SESSION_KEYS.accessToken, token);
    storage.set(SESSION_KEYS.refreshToken, refreshToken);
    storage.set(SESSION_KEYS.user, JSON.stringify(user));
    // Limpiamos la caché de queries para que no se filtren datos de una cuenta
    // anterior usada en esta misma pestaña.
    queryClient.clear();
    set({ user, token, isAuthenticated: true });
  },

  setSession: (user, token, refreshToken) => {
    storage.set(SESSION_KEYS.accessToken, token);
    storage.set(SESSION_KEYS.refreshToken, refreshToken);
    storage.set(SESSION_KEYS.user, JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  // Refresca datos visibles del usuario (ej. nombre tras editar el perfil) para que
  // la UI (sidebar) los muestre al instante, manteniendo sessionStorage en sync.
  updateUser: (partial) =>
    set((state) => {
      if (!state.user) return state;
      const user = { ...state.user, ...partial };
      storage.set('user', JSON.stringify(user));
      return { ...state, user };
    }),

  logout: () => {
    // Revoca la sesión en el backend: si no, el refresh token seguiría sirviendo
    // para sacar access tokens nuevos aunque el usuario "cerró sesión".
    revokeSession(storage.get(SESSION_KEYS.refreshToken));
    clearStorage();
    queryClient.clear();
    set({ user: null, token: null, isAuthenticated: false });
  },

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const token = storage.get(SESSION_KEYS.accessToken);
    const userStr = storage.get(SESSION_KEYS.user);
    const hasRefresh = !!storage.get(SESSION_KEYS.refreshToken);
    if (!token || !userStr) {
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }
    try {
      const user = JSON.parse(userStr) as AuthUser;
      const claims = parseJwt(token);
      const expired = claims?.exp ? claims.exp * 1000 <= Date.now() : false;
      // Defensa en profundidad: si el token no matchea al usuario guardado,
      // descartamos la sesión en vez de confiar en datos inconsistentes. Un
      // access token vencido NO mata la sesión si hay refresh token: el
      // interceptor de axios lo renueva en la primera request.
      if (
        !claims ||
        (expired && !hasRefresh) ||
        claims.sub !== user.id ||
        claims.role !== user.role
      ) {
        clearStorage();
        set({ user: null, token: null, isAuthenticated: false });
        return;
      }
      set({ user, token, isAuthenticated: true });
    } catch {
      clearStorage();
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));
