import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
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

// Las pantallas piden datos al montar; el ruteo no depende de esas respuestas,
// pero los nombres tienen que ser los reales de src/services/api.ts: con un
// nombre inventado el fetch tira TypeError, el `catch` del dashboard se lo traga
// y la pantalla monta en estado de error — el test seguiría verde probando menos
// de lo que dice.
jest.mock('../services/api', () => ({
  api: { get: jest.fn().mockResolvedValue({ data: {} }) },
  usersApi: {
    getMe: jest.fn().mockResolvedValue({ data: null }),
    updateMe: jest.fn(),
    deleteMe: jest.fn(),
  },
  loadsApi: {
    getMy: jest.fn().mockResolvedValue({ data: { loads: [] } }),
    getAvailable: jest.fn().mockResolvedValue({ data: { loads: [] } }),
  },
  tripsApi: {
    getMy: jest.fn().mockResolvedValue({ data: { trips: [] } }),
    getMyLoads: jest.fn().mockResolvedValue({ data: { trips: [] } }),
  },
  messagesApi: {
    getConversations: jest.fn().mockResolvedValue({ data: [] }),
    getUnreadCount: jest.fn().mockResolvedValue({ data: { count: 0 } }),
  },
  postulationsApi: { listMine: jest.fn().mockResolvedValue({ data: [] }) },
  // El panel del transportista consulta el estado de su perfil al montar; sin
  // este mock el módulo devuelve undefined y la pantalla revienta antes de
  // renderizar nada.
  transporterProfileApi: {
    getStatus: jest.fn().mockResolvedValue({ data: { status: 'APPROVED' } }),
    listDocuments: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

// En act() porque el store es zustand y el navigator está suscripto: mutarlo
// suelto llena la salida de advertencias que taparían un error de verdad.
const signInAs = (role: string) => {
  act(() => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'x@y.z', firstName: 'A', lastName: 'B', role } as any,
      token: 'fake-token',
      isAuthenticated: true,
      isLoading: false,
    });
  });
};

describe('AppNavigator — ruteo por rol', () => {
  afterEach(() => {
    act(() => {
      useAuthStore.setState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    });
  });

  // Las aserciones miran el título que renderiza la pantalla montada, no la
  // etiqueta de la pestaña: bottom-tabs monta sólo la screen inicial, así que
  // una etiqueta probaría nada más que la configuración del navigator.
  it('manda al transportista a su panel de viajes', async () => {
    signInAs('TRANSPORTER');
    render(<AppNavigator />);

    // 'Mis Viajes' es el título de carrier/DashboardScreen, la screen inicial.
    // Las dos aserciones van dentro del mismo waitFor: el panel resuelve el
    // estado del perfil después de montar, y esa actualización rearma el árbol
    // — afuera, la segunda consulta quedaba mirando un fiber ya desmontado.
    await waitFor(() => {
      expect(screen.getByText('Mis Viajes')).toBeTruthy();
      expect(screen.queryByText('Mis Cargas')).toBeNull();
    });
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

  // Importa porque en el perfil viven cerrar sesión y eliminar la cuenta, y
  // Apple exige que el borrado sea alcanzable desde la app.
  it('deja el perfil accesible para esos roles, que es donde se borra la cuenta', async () => {
    signInAs('ADMIN');
    render(<AppNavigator />);

    await waitFor(() =>
      expect(screen.getByText('Esta cuenta se administra desde el web')).toBeTruthy(),
    );

    // Se aprieta la pestaña: si sólo se mirara la etiqueta, el test pasaría
    // igual sin que ProfileScreen monte.
    fireEvent.press(screen.getByText('Perfil'));

    await waitFor(() => expect(screen.getByText('Cerrar Sesión')).toBeTruthy());
    expect(screen.getByText('Eliminar mi cuenta')).toBeTruthy();
  });
});
