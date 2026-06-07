import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth';

const user = {
  id: 'u1',
  email: 'a@b.com',
  firstName: 'Ana',
  lastName: 'Diaz',
  role: 'CARGO_GENERATOR' as const,
};

describe('mobile useAuthStore', () => {
  beforeEach(async () => {
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
});
