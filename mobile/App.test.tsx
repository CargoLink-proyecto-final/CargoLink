import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';
import { useAuthStore } from './src/store/auth';

/**
 * Smoke test del árbol completo: monta App con el navigator real. `expo export`
 * prueba que el bundle compila, pero no que el árbol de navegación monte — que
 * es donde pegan los cambios de major de react-navigation.
 */

jest.mock('expo-constants', () => ({
  expoConfig: { hostUri: '127.0.0.1:8081', extra: {} },
  expoGoConfig: null,
}));

// Con sesión hidratada el árbol engancha el listener global de mensajes. Sin
// estos mocks el smoke test abriría un websocket real contra localhost:3001 y
// dejaría el handle colgado al terminar la suite.
jest.mock('./src/services/socket', () => ({
  getChatSocket: jest.fn(() => ({ on: jest.fn(), off: jest.fn(), connected: false })),
  disconnectChatSocket: jest.fn(),
}));

jest.mock('./src/services/notifications', () => ({
  registerForPushNotifications: jest.fn().mockResolvedValue(null),
  scheduleLocalNotification: jest.fn(),
}));

describe('App', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
    });
  });

  it('hidrata la sesión y muestra el login cuando no hay token', async () => {
    const { getByText } = render(<App />);

    // Mientras isLoading es true el navigator no renderiza nada; después de
    // hidratar desde AsyncStorage debe caer en el stack de autenticación.
    await waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    await waitFor(() => {
      expect(getByText('Iniciar Sesión')).toBeTruthy();
    });
  });

  it('entra al stack autenticado cuando hay sesión guardada', async () => {
    await AsyncStorage.setItem('token', 'fake-token');
    await AsyncStorage.setItem(
      'user',
      JSON.stringify({
        id: 'u1',
        email: 'shipper@cargolink.test',
        firstName: 'Ana',
        lastName: 'Perez',
        role: 'CARGO_GENERATOR',
      }),
    );

    render(<App />);

    await waitFor(() => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.role).toBe('CARGO_GENERATOR');
    });
  });
});
