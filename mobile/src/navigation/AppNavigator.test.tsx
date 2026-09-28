import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import AppNavigator from './AppNavigator';
import { useAuthStore } from '../store/auth';

/**
 * El ruteo por rol se testea acá y no en el smoke test de App porque lo que
 * importa es la decisión, no el árbol: antes era `TRANSPORTER ? carrier :
 * shipper`, así que ADMIN y COMPANY_ADMIN —rol que apareció después— caían en la
 * interfaz de dador de carga y recibían 403 del backend.
 */

jest.mock('expo-constants', () => ({
  expoConfig: { hostUri: '127.0.0.1:8081', extra: {} },
  expoGoConfig: null,
}));

jest.mock('../services/socket', () => ({
  getChatSocket: jest.fn(() => ({ on: jest.fn(), off: jest.fn(), connected: false })),
  disconnectChatSocket: jest.fn(),
}));

jest.mock('../services/notifications', () => ({
  registerForPushNotifications: jest.fn().mockResolvedValue(null),
  scheduleLocalNotification: jest.fn(),
}));

// Las pantallas piden datos al montar; el ruteo no depende de esas respuestas.
jest.mock('../services/api', () => ({
  api: { get: jest.fn().mockResolvedValue({ data: {} }) },
  usersApi: {
    getMe: jest.fn().mockResolvedValue({ data: null }),
    updateMe: jest.fn(),
    deleteMe: jest.fn(),
  },
  loadsApi: {
    getMyLoads: jest.fn().mockResolvedValue({ data: { loads: [] } }),
    getAvailable: jest.fn().mockResolvedValue({ data: { loads: [] } }),
  },
  tripsApi: {
    getMyTrips: jest.fn().mockResolvedValue({ data: { trips: [] } }),
    getMyLoadTrips: jest.fn().mockResolvedValue({ data: { trips: [] } }),
  },
  messagesApi: {
    getConversations: jest.fn().mockResolvedValue({ data: [] }),
    getUnreadCount: jest.fn().mockResolvedValue({ data: { count: 0 } }),
  },
  postulationsApi: { getMyPostulations: jest.fn().mockResolvedValue({ data: [] }) },
}));

const signInAs = (role: string) => {
  useAuthStore.setState({
    user: { id: 'u1', email: 'x@y.z', firstName: 'A', lastName: 'B', role } as any,
    token: 'fake-token',
    isAuthenticated: true,
    isLoading: false,
  });
};

describe('AppNavigator — ruteo por rol', () => {
  afterEach(() => {
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('manda al transportista a buscar cargas', async () => {
    signInAs('TRANSPORTER');
    render(<AppNavigator />);

    await waitFor(() => expect(screen.getByText('Buscar Cargas')).toBeTruthy());
  });

  it('manda al dador de carga a sus cargas', async () => {
    signInAs('CARGO_GENERATOR');
    render(<AppNavigator />);

    // getAllBy porque el texto está en la pestaña y en el encabezado de la pantalla.
    await waitFor(() => expect(screen.getAllByText('Mis Cargas').length).toBeGreaterThan(0));
  });

  it.each(['ADMIN', 'COMPANY_ADMIN'])(
    'explica a %s que su cuenta se administra desde el web, en vez de un 403',
    async (role) => {
      signInAs(role);
      render(<AppNavigator />);

      await waitFor(() =>
        expect(screen.getByText('Esta cuenta se administra desde el web')).toBeTruthy(),
      );
      // No cae en la interfaz de dador de carga.
      expect(screen.queryByText('Mis Cargas')).toBeNull();
    },
  );

  it('deja el perfil accesible para esos roles, que es donde se borra la cuenta', async () => {
    signInAs('ADMIN');
    render(<AppNavigator />);

    await waitFor(() => expect(screen.getByText('Perfil')).toBeTruthy());
  });
});
