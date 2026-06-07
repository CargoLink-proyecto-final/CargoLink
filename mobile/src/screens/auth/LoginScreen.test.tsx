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
