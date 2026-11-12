import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { disconnectChatSocket } from '../services/socket';
import { revokeSession, setSessionHandlers, usersApi } from '../services/api';

interface AuthState {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: AuthState['user'], token: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

// Corta la recursión logout → clearPushToken responde 401 → el interceptor
// intenta renovar, falla → onExpired → logout otra vez.
let loggingOut = false;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (user, token, refreshToken) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('refreshToken', refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  logout: async () => {
    if (loggingOut) return;
    loggingOut = true;
    try {
      // Antes de borrar el JWT, que la request lo necesita. Sin esto el
      // dispositivo seguiría recibiendo las notificaciones del usuario que se fue.
      await usersApi.clearPushToken().catch(() => undefined);
      // Revoca la sesión en el backend: si no, el refresh token guardado
      // seguiría sirviendo para sacar access tokens nuevos después del logout.
      await revokeSession(await AsyncStorage.getItem('refreshToken'));
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('refreshToken');
      await AsyncStorage.removeItem('user');
      // El socket de chat está unido a las rooms del usuario que se va: si no lo
      // cerramos, quien loguee después sigue recibiendo sus mensajes.
      disconnectChatSocket();
      set({ user: null, token: null, isAuthenticated: false });
    } finally {
      loggingOut = false;
    }
  },

  hydrate: async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('user');
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));

// El cliente API renueva el access token por su cuenta (ver services/api.ts) y
// avisa acá para persistir la sesión nueva, o para cerrarla si murió.
setSessionHandlers({
  onRefreshed: async (session) => {
    await AsyncStorage.setItem('token', session.accessToken);
    await AsyncStorage.setItem('refreshToken', session.refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(session.user));
    useAuthStore.setState({
      user: session.user,
      token: session.accessToken,
      isAuthenticated: true,
    });
  },
  onExpired: async () => {
    if (useAuthStore.getState().isAuthenticated && !loggingOut) {
      await useAuthStore.getState().logout();
    }
  },
});
