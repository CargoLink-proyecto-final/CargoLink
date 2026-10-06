import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import ProfileScreen from './ProfileScreen';
import { usersApi } from '../../services/api';
import * as Location from 'expo-location';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('../../services/api', () => ({
  usersApi: {
    getMe: jest.fn(),
    updateMe: jest.fn(),
    deleteMe: jest.fn(),
  },
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

const mockLogout = jest.fn();
let mockUser: any = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'Diaz',
  role: 'CARGO_GENERATOR',
  isActive: true,
};

// useAuthStore is consumed as a plain hook returning the whole store object here.
jest.mock('../../store/auth', () => ({
  useAuthStore: () => ({ user: mockUser, logout: mockLogout }),
}));

const shipperProfile = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'Diaz',
  phone: '+54 351 555',
  companyName: 'AgroSur',
  industry: 'Agroindustria',
  role: 'CARGO_GENERATOR',
  isActive: true,
};

const carrierProfile = {
  id: 'u2',
  email: 'luis@example.com',
  firstName: 'Luis',
  lastName: 'Paz',
  role: 'TRANSPORTER',
  zoneLat: -31.42,
  zoneLng: -64.18,
  zoneRadiusKm: 50,
  isActive: true,
};

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      id: 'u1',
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Diaz',
      role: 'CARGO_GENERATOR',
      isActive: true,
    };
    (usersApi.getMe as jest.Mock).mockResolvedValue({ data: shipperProfile });
    (usersApi.updateMe as jest.Mock).mockResolvedValue({ data: shipperProfile });
  });

  it('loads the profile from the API and renders name, email and role label', async () => {
    render(<ProfileScreen />);

    await waitFor(() => expect(screen.getByText('Ana Diaz')).toBeTruthy());
    expect(usersApi.getMe).toHaveBeenCalled();
    expect(screen.getByText('ana@example.com')).toBeTruthy();
    // Label del producto, no el enum crudo.
    expect(screen.getByText('Publicador de carga')).toBeTruthy();
    expect(screen.getByText('AD')).toBeTruthy();
  });

  it('falls back to the stored user when /users/me fails', async () => {
    (usersApi.getMe as jest.Mock).mockRejectedValue(new Error('network'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<ProfileScreen />);

    await waitFor(() => expect(screen.getByText('Ana Diaz')).toBeTruthy());
  });

  it('renders nothing when there is neither profile nor stored user', async () => {
    mockUser = null;
    (usersApi.getMe as jest.Mock).mockResolvedValue({ data: null });

    render(<ProfileScreen />);

    await waitFor(() => expect(usersApi.getMe).toHaveBeenCalled());
    expect(screen.queryByText('Cerrar Sesión')).toBeNull();
  });

  describe('shipper', () => {
    it('shows the industry and saves an edit to it', async () => {
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Agroindustria')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.changeText(screen.getByPlaceholderText('Ej., Agroindustria'), 'Logística');
      fireEvent.press(screen.getByText('Guardar'));

      await waitFor(() =>
        expect(usersApi.updateMe).toHaveBeenCalledWith(
          expect.objectContaining({ industry: 'Logística' }),
        ),
      );
    });

    it('lets the industry be cleared', async () => {
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Agroindustria')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.changeText(screen.getByPlaceholderText('Ej., Agroindustria'), '');
      fireEvent.press(screen.getByText('Guardar'));

      await waitFor(() =>
        expect(usersApi.updateMe).toHaveBeenCalledWith(
          expect.objectContaining({ industry: '' }),
        ),
      );
    });

    it('omits empty required fields so the DTO does not reject them', async () => {
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Agroindustria')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.changeText(screen.getByPlaceholderText('Nombre de la empresa'), '   ');
      fireEvent.press(screen.getByText('Guardar'));

      await waitFor(() => expect(usersApi.updateMe).toHaveBeenCalled());
      expect(usersApi.updateMe).toHaveBeenCalledWith(
        expect.not.objectContaining({ companyName: expect.anything() }),
      );
    });

    it('does not send carrier zone fields', async () => {
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Agroindustria')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.press(screen.getByText('Guardar'));

      await waitFor(() => expect(usersApi.updateMe).toHaveBeenCalled());
      expect(usersApi.updateMe).toHaveBeenCalledWith(
        expect.not.objectContaining({ zoneLat: expect.anything() }),
      );
    });

    it('shows a server error message when saving fails', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      (usersApi.updateMe as jest.Mock).mockRejectedValue({
        response: { data: { message: 'Rubro inválido' } },
      });

      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Agroindustria')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.press(screen.getByText('Guardar'));

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Error', 'Rubro inválido'));
      alertSpy.mockRestore();
    });

    it('restores the original values when the edit is cancelled', async () => {
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Agroindustria')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.changeText(screen.getByPlaceholderText('Ej., Agroindustria'), 'Otra cosa');
      fireEvent.press(screen.getByText('Cancelar'));

      await waitFor(() => expect(screen.getByText('Agroindustria')).toBeTruthy());
      expect(usersApi.updateMe).not.toHaveBeenCalled();
    });

    it('does not offer the zone section', async () => {
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Agroindustria')).toBeTruthy());
      expect(screen.queryByText('Zona de influencia')).toBeNull();
    });
  });

  describe('transporter', () => {
    beforeEach(() => {
      mockUser = { ...carrierProfile };
      (usersApi.getMe as jest.Mock).mockResolvedValue({ data: carrierProfile });
      (usersApi.updateMe as jest.Mock).mockResolvedValue({ data: carrierProfile });
    });

    it('shows the saved zone', async () => {
      render(<ProfileScreen />);

      await waitFor(() => expect(screen.getByText('Zona de influencia')).toBeTruthy());
      expect(screen.getByText('-31.42, -64.18')).toBeTruthy();
      expect(screen.getByText('50 km')).toBeTruthy();
    });

    it('prompts to define a zone when there is none', async () => {
      (usersApi.getMe as jest.Mock).mockResolvedValue({
        data: { ...carrierProfile, zoneLat: null, zoneLng: null, zoneRadiusKm: null },
      });

      render(<ProfileScreen />);

      await waitFor(() =>
        expect(screen.getByText('Todavía no definiste tu zona.')).toBeTruthy(),
      );
    });

    it('saves the zone as numbers', async () => {
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Zona de influencia')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.changeText(screen.getByPlaceholderText('-31.42'), '-34.6');
      fireEvent.changeText(screen.getByPlaceholderText('-64.18'), '-58.38');
      fireEvent.changeText(screen.getByPlaceholderText('50'), '120');
      fireEvent.press(screen.getByText('Guardar'));

      await waitFor(() =>
        expect(usersApi.updateMe).toHaveBeenCalledWith(
          expect.objectContaining({ zoneLat: -34.6, zoneLng: -58.38, zoneRadiusKm: 120 }),
        ),
      );
    });

    it('sends undefined for a zone field left empty', async () => {
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Zona de influencia')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.changeText(screen.getByPlaceholderText('50'), '');
      fireEvent.press(screen.getByText('Guardar'));

      await waitFor(() => expect(usersApi.updateMe).toHaveBeenCalled());
      expect(
        (usersApi.updateMe as jest.Mock).mock.calls[0][0].zoneRadiusKm,
      ).toBeUndefined();
    });

    it('fills the coordinates from the device location', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
        coords: { latitude: -32.8908, longitude: -68.8272 },
      });

      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Zona de influencia')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.press(screen.getByText('Usar mi ubicación actual'));

      await waitFor(() =>
        expect(screen.getByPlaceholderText('-31.42').props.value).toBe('-32.89080'),
      );
      expect(screen.getByPlaceholderText('-64.18').props.value).toBe('-68.82720');
    });

    it('warns when the location permission is denied', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Zona de influencia')).toBeTruthy());

      fireEvent.press(screen.getByText('Editar'));
      fireEvent.press(screen.getByText('Usar mi ubicación actual'));

      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith(
          'Permiso denegado',
          'No pudimos acceder a tu ubicación.',
        ),
      );
      expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('does not offer the industry section', async () => {
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Zona de influencia')).toBeTruthy());
      expect(screen.queryByText('Rubro')).toBeNull();
    });
  });

  it('opens a confirmation alert and logs out via its destructive action', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByText('Ana Diaz')).toBeTruthy());

    fireEvent.press(screen.getByText('Cerrar Sesión'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Cerrar Sesión',
      '¿Estás seguro?',
      expect.any(Array),
    );

    // Invoke the destructive button's onPress as Alert would.
    const actions = alertSpy.mock.calls[0][2] as any[];
    actions.find((a) => a.style === 'destructive').onPress();
    expect(mockLogout).toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  // Apple exige que la baja se pueda pedir desde la app. El punto de estos tests
  // es que no se dispare con un solo toque y que cierre sesión después.
  describe('eliminar cuenta', () => {
    const pressDelete = async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      render(<ProfileScreen />);
      await waitFor(() => expect(screen.getByText('Ana Diaz')).toBeTruthy());

      fireEvent.press(screen.getByText('Eliminar mi cuenta'));
      return alertSpy;
    };

    const confirmTwice = (alertSpy: jest.SpyInstance) => {
      const first = alertSpy.mock.calls[0][2] as any[];
      first.find((a) => a.style === 'destructive').onPress();
      const second = alertSpy.mock.calls[1][2] as any[];
      return second.find((a) => a.style === 'destructive').onPress();
    };

    it('pide dos confirmaciones antes de llamar al API', async () => {
      (usersApi.deleteMe as jest.Mock).mockResolvedValue({ data: { deleted: true } });
      const alertSpy = await pressDelete();

      // Primer toque: sólo advierte, todavía no borra nada.
      expect(usersApi.deleteMe).not.toHaveBeenCalled();

      const first = alertSpy.mock.calls[0][2] as any[];
      first.find((a) => a.style === 'destructive').onPress();
      expect(usersApi.deleteMe).not.toHaveBeenCalled();

      const second = alertSpy.mock.calls[1][2] as any[];
      await second.find((a) => a.style === 'destructive').onPress();
      expect(usersApi.deleteMe).toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('cierra sesión cuando el borrado sale bien', async () => {
      (usersApi.deleteMe as jest.Mock).mockResolvedValue({ data: { deleted: true } });
      const alertSpy = await pressDelete();

      await confirmTwice(alertSpy);

      await waitFor(() => expect(mockLogout).toHaveBeenCalled());
      alertSpy.mockRestore();
    });

    it('avisa y mantiene la sesión si el backend rechaza el borrado', async () => {
      (usersApi.deleteMe as jest.Mock).mockRejectedValue({
        response: { data: { message: 'No se puede eliminar la cuenta: tiene viajes activos.' } },
      });
      const alertSpy = await pressDelete();

      await confirmTwice(alertSpy);

      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith(
          'No pudimos eliminar la cuenta',
          'No se puede eliminar la cuenta: tiene viajes activos.',
        ),
      );
      expect(mockLogout).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });
});
