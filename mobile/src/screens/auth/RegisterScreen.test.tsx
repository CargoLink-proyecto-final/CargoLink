import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RegisterScreen from './RegisterScreen';
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

const fillRequired = (q: ReturnType<typeof render>) => {
  fireEvent.changeText(q.getByPlaceholderText('Nombre *'), 'Ana');
  fireEvent.changeText(q.getByPlaceholderText('Apellido *'), 'Diaz');
  fireEvent.changeText(q.getByPlaceholderText('Correo electrónico *'), 'a@b.com');
  fireEvent.changeText(q.getByPlaceholderText('Contraseña *'), 'secret123');
  fireEvent.changeText(q.getByPlaceholderText('Teléfono *'), '099123456');
};

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.register as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' }, accessToken: 'tok-123' },
    });
  });

  it('renders all required fields and the role selector', () => {
    const { getByPlaceholderText, getByText } = render(<RegisterScreen navigation={navigation} />);
    expect(getByPlaceholderText('Nombre *')).toBeTruthy();
    expect(getByPlaceholderText('Apellido *')).toBeTruthy();
    expect(getByPlaceholderText('Correo electrónico *')).toBeTruthy();
    expect(getByPlaceholderText('Contraseña *')).toBeTruthy();
    expect(getByPlaceholderText('Teléfono *')).toBeTruthy();
    expect(getByText('Generador de carga')).toBeTruthy();
    expect(getByText('Transportista')).toBeTruthy();
    expect(getByText('Crear Cuenta')).toBeTruthy();
  });

  it('registers with entered values and the default role, then logs in', async () => {
    const q = render(<RegisterScreen navigation={navigation} />);
    fillRequired(q);
    fireEvent.press(q.getByText('Crear Cuenta'));

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith({
        firstName: 'Ana',
        lastName: 'Diaz',
        email: 'a@b.com',
        password: 'secret123',
        phone: '099123456',
        role: 'CARGO_GENERATOR',
      });
    });
    expect(mockLogin).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.com' }, 'tok-123');
  });

  it('sends the selected role when switching to Transportista', async () => {
    const q = render(<RegisterScreen navigation={navigation} />);
    fireEvent.press(q.getByText('Transportista'));
    fillRequired(q);
    fireEvent.press(q.getByText('Crear Cuenta'));

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'TRANSPORTER' }),
      );
    });
  });

  it('surfaces an alert when registration fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (authApi.register as jest.Mock).mockRejectedValue({
      response: { data: { message: 'El correo ya está en uso' } },
    });

    const q = render(<RegisterScreen navigation={navigation} />);
    fillRequired(q);
    fireEvent.press(q.getByText('Crear Cuenta'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Error', 'El correo ya está en uso');
    });
    expect(mockLogin).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  // NOTE: RegisterScreen declares `formState: { errors }` but never renders any
  // error message (unlike Login/Forgot). Validation still blocks the submit, but
  // the user sees no feedback. We assert the actual behavior: submit is blocked
  // and no error text is shown. (Suspected UX bug — missing error rendering.)
  it('blocks submission when required fields are empty (no error text rendered)', async () => {
    const { getByText, queryByText } = render(<RegisterScreen navigation={navigation} />);
    fireEvent.press(getByText('Crear Cuenta'));

    await waitFor(() => {
      expect(authApi.register).not.toHaveBeenCalled();
    });
    // Bug: no validation messages are rendered for the user.
    expect(queryByText('Correo electrónico obligatorio')).toBeNull();
    expect(queryByText('Contraseña obligatoria')).toBeNull();
    expect(queryByText('El teléfono es obligatorio')).toBeNull();
  });

  it('navigates to Login via the link', () => {
    const { getByText } = render(<RegisterScreen navigation={navigation} />);
    fireEvent.press(getByText(/Iniciar sesión/));
    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });
});
