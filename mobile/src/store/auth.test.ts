import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';
import { usersApi, setUnauthorizedHandler } from '../services/api';
import { disconnectChatSocket } from '../services/socket';

jest.mock('../services/api', () => ({
  usersApi: { clearPushToken: jest.fn() },
  setUnauthorizedHandler: jest.fn(),
}));

jest.mock('../services/socket', () => ({
  disconnectChatSocket: jest.fn(),
}));

// Se registra al importar el store; se captura antes de que los beforeEach
// limpien el historial de llamadas de los mocks.
const registeredUnauthorizedHandler = (setUnauthorizedHandler as jest.Mock).mock.calls[0]?.[0];

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
      await useAuthStore.getState().login(user, 'tok-123');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('token', 'tok-123');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(user));
      const s = useAuthStore.getState();
      expect(s.user).toEqual(user);
      expect(s.token).toBe('tok-123');
      expect(s.isAuthenticated).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears storage and resets state', async () => {
      await useAuthStore.getState().login(user, 'tok-123');
      await useAuthStore.getState().logout();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('token');
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
    it('unregisters the device before dropping the token', async () => {
      await useAuthStore.getState().login(user, 'jwt');

      await useAuthStore.getState().logout();

      // Va antes de borrar el JWT porque la request lo necesita; si no, el
      // teléfono seguiría recibiendo las notificaciones del que se fue.
      expect(usersApi.clearPushToken).toHaveBeenCalled();
      expect(await AsyncStorage.getItem('token')).toBeNull();
      expect(disconnectChatSocket).toHaveBeenCalled();
    });

    it('logs out anyway when unregistering fails', async () => {
      (usersApi.clearPushToken as jest.Mock).mockRejectedValue(new Error('offline'));
      await useAuthStore.getState().login(user, 'jwt');

      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(await AsyncStorage.getItem('token')).toBeNull();
    });
  });
  describe('expireSession (401 from the API)', () => {
    it('is registered as the api unauthorized handler', async () => {
      await useAuthStore.getState().login(user, 'tok-old');

      registeredUnauthorizedHandler('tok-old');
      await new Promise((r) => setImmediate(r));

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('clears the session without calling the API again', async () => {
      await useAuthStore.getState().login(user, 'tok-old');

      await useAuthStore.getState().expireSession('tok-old');

      // clearPushToken con un JWT inválido daría otro 401 y volvería a entrar acá.
      expect(usersApi.clearPushToken).not.toHaveBeenCalled();
      expect(disconnectChatSocket).toHaveBeenCalled();
      expect(await AsyncStorage.getItem('token')).toBeNull();
      expect(await AsyncStorage.getItem('user')).toBeNull();
      const s = useAuthStore.getState();
      expect(s.user).toBeNull();
      expect(s.token).toBeNull();
      expect(s.isAuthenticated).toBe(false);
    });

    it('ignores a 401 for a token that is no longer the current one', async () => {
      await useAuthStore.getState().login(user, 'tok-new');

      await useAuthStore.getState().expireSession('tok-old');

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(await AsyncStorage.getItem('token')).toBe('tok-new');
    });

    it('does nothing when already logged out', async () => {
      await useAuthStore.getState().expireSession('tok-old');

      expect(disconnectChatSocket).not.toHaveBeenCalled();
    });
  });
});
