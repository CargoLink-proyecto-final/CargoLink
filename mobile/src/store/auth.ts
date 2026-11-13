import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Role } from '../types';
import { disconnectChatSocket } from '../services/socket';
import { usersApi, setUnauthorizedHandler } from '../services/api';

interface AuthState {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: AuthState['user'], token: string) => Promise<void>;
  logout: () => Promise<void>;
  expireSession: (rejectedToken: string) => Promise<void>;
  hydrate: () => Promise<void>;
}

const clearLocalSession = async () => {
  await AsyncStorage.removeItem('token');
  await AsyncStorage.removeItem('user');
  // El socket de chat está unido a las rooms del usuario que se va: si no lo
  // cerramos, quien loguee después sigue recibiendo sus mensajes.
  disconnectChatSocket();
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (user, token) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  logout: async () => {
    // Antes de borrar el JWT, que la request lo necesita. Sin esto el
    // dispositivo seguiría recibiendo las notificaciones del usuario que se fue.
    await usersApi.clearPushToken().catch(() => undefined);
    await clearLocalSession();
    set({ user: null, token: null, isAuthenticated: false });
  },

  // Igual que logout pero sin `clearPushToken`: con el JWT inválido esa request
  // da otro 401 y volvería a disparar esto. Se ignoran los 401 de un token que
  // ya no es el actual (requests en vuelo de antes de un login nuevo).
  expireSession: async (rejectedToken) => {
    const { isAuthenticated, token } = get();
    if (!isAuthenticated || token !== rejectedToken) return;
    set({ user: null, token: null, isAuthenticated: false });
    await clearLocalSession();
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

setUnauthorizedHandler((rejectedToken) => {
  useAuthStore.getState().expireSession(rejectedToken);
});
