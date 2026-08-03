/**
 * env.ts resuelve la URL del API en tiempo de import, así que cada caso resetea
 * el módulo y vuelve a requerirlo con distintos mocks de expo-constants.
 */

let mockExpoConfig: Record<string, unknown> | null = null;
let mockExpoGoConfig: Record<string, unknown> | null = null;

jest.mock('expo-constants', () => ({
  get expoConfig() {
    return mockExpoConfig;
  },
  get expoGoConfig() {
    return mockExpoGoConfig;
  },
}));

function loadEnv() {
  let mod: typeof import('./env');
  jest.isolateModules(() => {
    mod = require('./env');
  });
  return mod!;
}

describe('config/env', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(() => {
    mockExpoConfig = null;
    mockExpoGoConfig = null;
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  afterAll(() => {
    if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
  });

  describe('API_URL', () => {
    it('prefers the EXPO_PUBLIC_API_URL override', () => {
      process.env.EXPO_PUBLIC_API_URL = 'https://api.cargolink.app/api';
      mockExpoConfig = { hostUri: '192.168.1.42:8081' };

      expect(loadEnv().API_URL).toBe('https://api.cargolink.app/api');
    });

    it('strips trailing slashes from the override', () => {
      process.env.EXPO_PUBLIC_API_URL = 'https://api.cargolink.app/api//';

      expect(loadEnv().API_URL).toBe('https://api.cargolink.app/api');
    });

    it('falls back to extra.apiUrl from the expo config', () => {
      mockExpoConfig = { extra: { apiUrl: 'https://dev.cargolink.app/api' } };

      expect(loadEnv().API_URL).toBe('https://dev.cargolink.app/api');
    });

    it('derives the dev host from the metro server so a physical device can reach it', () => {
      mockExpoConfig = { hostUri: '192.168.1.42:8081' };

      expect(loadEnv().API_URL).toBe('http://192.168.1.42:3001/api');
    });

    it('reads the host from expoGoConfig.debuggerHost when hostUri is absent', () => {
      mockExpoGoConfig = { debuggerHost: '10.0.0.7:8081' };

      expect(loadEnv().API_URL).toBe('http://10.0.0.7:3001/api');
    });

    it('falls back to localhost when there is no metro host', () => {
      expect(loadEnv().API_URL).toBe('http://localhost:3001/api');
    });

    it('ignores an empty extra.apiUrl instead of producing a relative URL', () => {
      mockExpoConfig = { extra: { apiUrl: '' }, hostUri: '192.168.1.42:8081' };

      expect(loadEnv().API_URL).toBe('http://192.168.1.42:3001/api');
    });
  });

  describe('SOCKET_URL', () => {
    it('drops the /api prefix because the chat gateway lives at the server root', () => {
      mockExpoConfig = { hostUri: '192.168.1.42:8081' };

      expect(loadEnv().SOCKET_URL).toBe('http://192.168.1.42:3001');
    });

    it('keeps the origin intact for a remote api url', () => {
      process.env.EXPO_PUBLIC_API_URL = 'https://api.cargolink.app/api';

      expect(loadEnv().SOCKET_URL).toBe('https://api.cargolink.app');
    });
  });
});
