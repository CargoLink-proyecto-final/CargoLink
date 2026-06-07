import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from './page';
import { authApi } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/auth/forgot-password',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  authApi: {
    forgotPassword: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ForgotPasswordPage', () => {
  it('renders the email form', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole('heading', { name: /Olvidaste tu/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('tu@empresa.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar enlace/ })).toBeInTheDocument();
  });

  it('blocks empty submit with a required message', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));
    expect(await screen.findByText('El correo electrónico es obligatorio')).toBeInTheDocument();
    expect(authApi.forgotPassword).not.toHaveBeenCalled();
  });

  it('calls authApi.forgotPassword and shows the success state', async () => {
    const user = userEvent.setup();
    (authApi.forgotPassword as jest.Mock).mockResolvedValue({ data: {} });
    render(<ForgotPasswordPage />);
    await user.type(screen.getByPlaceholderText('tu@empresa.com'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));

    await waitFor(() =>
      expect(authApi.forgotPassword).toHaveBeenCalledWith('user@example.com'),
    );
    expect(await screen.findByText('Correo enviado')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('tu@empresa.com')).not.toBeInTheDocument();
  });

  it('surfaces an error message when the request fails', async () => {
    const user = userEvent.setup();
    (authApi.forgotPassword as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Demasiados intentos' } },
    });
    render(<ForgotPasswordPage />);
    await user.type(screen.getByPlaceholderText('tu@empresa.com'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));

    expect(await screen.findByText('Demasiados intentos')).toBeInTheDocument();
    expect(screen.queryByText('Correo enviado')).not.toBeInTheDocument();
  });
});
