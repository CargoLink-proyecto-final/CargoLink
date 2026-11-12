import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from './LoginScreen';
import { authApi } from '../../services/api';

const mockLogin = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../services/api', () => ({
  authApi: {
    login: jest.fn(),
    register: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    resendVerification: jest.fn(),
  },
}));

jest.mock('../../store/auth', () => {
  const state = { login: (...args: any[]) => mockLogin(...args) };
  const useAuthStore: any = (sel?: any) => (sel ? sel(state) : state);
  useAuthStore.getState = () => state;
  return { useAuthStore };
});

const navigation = { navigate: mockNavigate, goBack: jest.fn(), reset: jest.fn() };

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.login as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' }, accessToken: 'tok-123' },
    });
  });

  // El backend responde 403 con este código cuando falta verificar el correo.
  // Sin el reenvío, el enlace vencido dejaba al usuario trabado: desde el
  // teléfono no había forma de pedir otro.
  describe('correo sin verificar', () => {
    const emailNotVerified = {
      response: {
        data: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Tenés que verificar tu correo electrónico antes de iniciar sesión.',
          email: 'a@b.com',
        },
      },
    };

    const submit = async () => {
      const { getByPlaceholderText, getByText } = render(<LoginScreen navigation={navigation} />);
      fireEvent.changeText(getByPlaceholderText('Correo electrónico *'), 'a@b.com');
      fireEvent.changeText(getByPlaceholderText('Contraseña *'), 'secret123');
      fireEvent.press(getByText('Iniciar Sesión'));
    };

    it('ofrece reenviar el enlace en vez de dejar sólo el error', async () => {
      (authApi.login as jest.Mock).mockRejectedValue(emailNotVerified);
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      await submit();

      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(alertSpy.mock.calls[0][0]).toBe('Falta verificar tu correo');
      const actions = alertSpy.mock.calls[0][2] as any[];
      expect(actions.some((a) => a.text === 'Reenviar')).toBe(true);
      // Todavía no llamó al API: hace falta que el usuario lo pida.
      expect(authApi.resendVerification).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('reenvía al correo que devolvió el backend', async () => {
      (authApi.login as jest.Mock).mockRejectedValue(emailNotVerified);
      (authApi.resendVerification as jest.Mock).mockResolvedValue({
        data: { message: 'Si existe una cuenta sin verificar para ese correo, te enviamos un nuevo enlace.' },
      });
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      await submit();
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      const actions = alertSpy.mock.calls[0][2] as any[];
      await actions.find((a) => a.text === 'Reenviar').onPress();

      expect(authApi.resendVerification).toHaveBeenCalledWith('a@b.com');
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Listo', expect.any(String)));

      alertSpy.mockRestore();
    });

    it('no ofrece reenvío para un error de credenciales', async () => {
      (authApi.login as jest.Mock).mockRejectedValue({
        response: { data: { message: 'Credenciales inválidas' } },
      });
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      await submit();

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Error', 'Credenciales inválidas'));
      alertSpy.mockRestore();
    });
  });

  it('renders the email and password fields', () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen navigation={navigation} />);
    expect(getByPlaceholderText('Correo electrónico *')).toBeTruthy();
    expect(getByPlaceholderText('Contraseña *')).toBeTruthy();
    expect(getByText('Iniciar Sesión')).toBeTruthy();
  });

  it('submits credentials, logs in to the store, on valid input', async () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText('Correo electrónico *'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Contraseña *'), 'secret123');
    fireEvent.press(getByText('Iniciar Sesión'));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' });
    });
    expect(mockLogin).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.com' }, 'tok-123');
  });

  it('surfaces an alert when login fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (authApi.login as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Credenciales inválidas' } },
    });

    const { getByPlaceholderText, getByText } = render(<LoginScreen navigation={navigation} />);
    fireEvent.changeText(getByPlaceholderText('Correo electrónico *'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Contraseña *'), 'wrong');
    fireEvent.press(getByText('Iniciar Sesión'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Credenciales inválidas');
    });
    expect(mockLogin).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('blocks submission and shows validation errors when fields are empty', async () => {
    const { getByText, findByText } = render(<LoginScreen navigation={navigation} />);
    fireEvent.press(getByText('Iniciar Sesión'));

    expect(await findByText('El correo electrónico es obligatorio')).toBeTruthy();
    expect(await findByText('La contraseña es obligatoria')).toBeTruthy();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('navigates to Register and ForgotPassword via links', () => {
    const { getByText } = render(<LoginScreen navigation={navigation} />);
    fireEvent.press(getByText('¿Olvidaste tu contraseña?'));
    expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword');
    fireEvent.press(getByText(/Registrarse/));
    expect(mockNavigate).toHaveBeenCalledWith('Register');
  });
});
