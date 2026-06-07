import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import { authApi } from '../../services/api';

const mockNavigate = jest.fn();

jest.mock('../../services/api', () => ({
  authApi: {
    login: jest.fn(),
    register: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  },
}));

const navigation = { navigate: mockNavigate, goBack: jest.fn(), reset: jest.fn() };

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authApi.forgotPassword as jest.Mock).mockResolvedValue({ data: {} });
  });

  it('renders the email field and submit button', () => {
    const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen navigation={navigation} />);
    expect(getByPlaceholderText('Correo electrónico *')).toBeTruthy();
    expect(getByText('Enviar Enlace')).toBeTruthy();
  });

  it('calls forgotPassword with the entered email and shows the success state', async () => {
    const { getByPlaceholderText, getByText, queryByPlaceholderText } = render(
      <ForgotPasswordScreen navigation={navigation} />,
    );

    fireEvent.changeText(getByPlaceholderText('Correo electrónico *'), 'a@b.com');
    fireEvent.press(getByText('Enviar Enlace'));

    await waitFor(() => {
      expect(authApi.forgotPassword).toHaveBeenCalledWith('a@b.com');
    });
    await waitFor(() => {
      expect(getByText(/se ha enviado un enlace de restablecimiento/)).toBeTruthy();
    });
    expect(queryByPlaceholderText('Correo electrónico *')).toBeNull();
  });

  it('surfaces an alert when the request fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (authApi.forgotPassword as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Servicio no disponible' } },
    });

    const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen navigation={navigation} />);
    fireEvent.changeText(getByPlaceholderText('Correo electrónico *'), 'a@b.com');
    fireEvent.press(getByText('Enviar Enlace'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Servicio no disponible');
    });
    alertSpy.mockRestore();
  });

  it('blocks submission and shows a validation error when email is empty', async () => {
    const { getByText, findByText } = render(<ForgotPasswordScreen navigation={navigation} />);
    fireEvent.press(getByText('Enviar Enlace'));

    expect(await findByText('El correo electrónico es obligatorio')).toBeTruthy();
    expect(authApi.forgotPassword).not.toHaveBeenCalled();
  });

  it('navigates back to Login', () => {
    const { getByText } = render(<ForgotPasswordScreen navigation={navigation} />);
    fireEvent.press(getByText('Volver al inicio de sesión'));
    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });
});
