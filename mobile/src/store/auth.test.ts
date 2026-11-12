import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';
import { revokeSession, setSessionHandlers, usersApi } from '../services/api';
import { disconnectChatSocket } from '../services/socket';

jest.mock('../services/api', () => ({
  usersApi: { clearPushToken: jest.fn() },
  revokeSession: jest.fn(() => Promise.resolve()),
  setSessionHandlers: jest.fn(),
}));

// Los handlers que el store registra al cargarse (antes de que beforeEach limpie
// los mocks).
const handlers = (setSessionHandlers as jest.Mock).mock.calls[0][0];

jest.mock('../services/socket', () => ({
  disconnectChatSocket: jest.fn(),
}));

const user = {
  id: 'u1',
  email: 'a@b.com',
  firstName: 'Ana',
  lastName: 'Diaz',
  role: 'CARGO_GENERATOR' as const,
};

describe('mobile useAuthStore', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (usersApi.clearPushToken as jest.Mock).mockResolvedValue({ data: {} });
    await AsyncStorage.clear();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
    });
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('persists token + user and marks authenticated', async () => {
      await useAuthStore.getState().login(user, 'tok-123', 'rt-1');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('token', 'tok-123');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('refreshToken', 'rt-1');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(user));
      const s = useAuthStore.getState();
      expect(s.user).toEqual(user);
      expect(s.token).toBe('tok-123');
      expect(s.isAuthenticated).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears storage and resets state', async () => {
      await useAuthStore.getState().login(user, 'tok-123', 'rt-1');
      await useAuthStore.getState().logout();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('refreshToken');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user');
      const s = useAuthStore.getState();
      expect(s.user).toBeNull();
      expect(s.token).toBeNull();
      expect(s.isAuthenticated).toBe(false);
    });
  });

  describe('hydrate', () => {
    it('restores a stored session and stops loading', async () => {
      await AsyncStorage.setItem('token', 'tok-123');
      await AsyncStorage.setItem('user', JSON.stringify(user));

      await useAuthStore.getState().hydrate();

      const s = useAuthStore.getState();
      expect(s.user).toEqual(user);
      expect(s.token).toBe('tok-123');
      expect(s.isAuthenticated).toBe(true);
      expect(s.isLoading).toBe(false);
    });

    it('stays unauthenticated and stops loading when nothing is stored', async () => {
      await useAuthStore.getState().hydrate();

      const s = useAuthStore.getState();
      expect(s.isAuthenticated).toBe(false);
      expect(s.isLoading).toBe(false);
    });

    it('stops loading when only one key is present', async () => {
      await AsyncStorage.setItem('token', 'tok-123');

      await useAuthStore.getState().hydrate();

      const s = useAuthStore.getState();
      expect(s.isAuthenticated).toBe(false);
      expect(s.isLoading).toBe(false);
    });

    it('swallows malformed stored JSON and stops loading', async () => {
      await AsyncStorage.setItem('token', 'tok-123');
      await AsyncStorage.setItem('user', 'not-json{');

      await useAuthStore.getState().hydrate();

      const s = useAuthStore.getState();
      expect(s.isLoading).toBe(false);
      expect(s.isAuthenticated).toBe(false);
    });
  });

  describe('logout', () => {
    // Sin esto el refresh token seguiría vivo en el backend después del logout.
    it('revokes the session on the backend', async () => {
      await useAuthStore.getState().login(user, 'jwt', 'rt-1');
      await useAuthStore.getState().logout();
      expect(revokeSession).toHaveBeenCalledWith('rt-1');
    });

    it('unregisters the device before dropping the token', async () => {
      await useAuthStore.getState().login(user, 'jwt', 'rt-1');

      await useAuthStore.getState().logout();

      // Va antes de borrar el JWT porque la request lo necesita; si no, el
      // teléfono seguiría recibiendo las notificaciones del que se fue.
      expect(usersApi.clearPushToken).toHaveBeenCalled();
      expect(await AsyncStorage.getItem('token')).toBeNull();
      expect(disconnectChatSocket).toHaveBeenCalled();
    });

    it('logs out anyway when unregistering fails', async () => {
      (usersApi.clearPushToken as jest.Mock).mockRejectedValue(new Error('offline'));
      await useAuthStore.getState().login(user, 'jwt', 'rt-1');

      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(await AsyncStorage.getItem('token')).toBeNull();
    });
  });

  describe('session handlers', () => {
    it('persists a renewed session', async () => {
      await handlers.onRefreshed({ user, accessToken: 'new-access', refreshToken: 'new-rt' });

      expect(await AsyncStorage.getItem('token')).toBe('new-access');
      expect(await AsyncStorage.getItem('refreshToken')).toBe('new-rt');
      expect(useAuthStore.getState().token).toBe('new-access');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('logs out when the session expired', async () => {
      await useAuthStore.getState().login(user, 'jwt', 'rt-1');
      await handlers.onExpired();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(await AsyncStorage.getItem('refreshToken')).toBeNull();
    });

    // logout → clearPushToken da 401 → el interceptor dispara onExpired otra vez:
    // sin la guarda eso era recursión infinita.
    it('does not re-enter logout while one is in progress', async () => {
      await useAuthStore.getState().login(user, 'jwt', 'rt-1');
      (usersApi.clearPushToken as jest.Mock).mockImplementation(async () => {
        await handlers.onExpired();
        return { data: {} };
      });

      await useAuthStore.getState().logout();

      expect(usersApi.clearPushToken).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });
});
