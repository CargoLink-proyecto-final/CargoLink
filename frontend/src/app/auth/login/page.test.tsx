import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/auth/login',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/lib/api', () => ({
  authApi: {
    login: jest.fn(),
    resendVerification: jest.fn(),
  },
}));

const login = jest.fn();

function mockAuth() {
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel?: (s: unknown) => unknown) => {
    const state = { login };
    return sel ? sel(state) : state;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth();
});

describe('LoginPage — rendering', () => {
  it('renders the login form fields and submit button', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: /Iniciá/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('tu@empresa.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar sesión/ })).toBeInTheDocument();
  });
});

describe('LoginPage — validation', () => {
  it('blocks empty submit and shows required messages', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /Iniciar sesión/ }));
    expect(await screen.findByText('El correo electrónico es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('La contraseña es obligatoria')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('shows a min-length error for short passwords', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText('tu@empresa.com'), 'a@b.com');
    await user.type(screen.getByPlaceholderText('••••••••'), '123');
    await user.click(screen.getByRole('button', { name: /Iniciar sesión/ }));
    expect(await screen.findByText('Mínimo 6 caracteres')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });
});

describe('LoginPage — submit', () => {
  it('calls authApi.login, stores the session and redirects on success', async () => {
    const user = userEvent.setup();
    (authApi.login as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' }, accessToken: 'tok' },
    });
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText('tu@empresa.com'), 'user@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'secret123');
    await user.click(screen.getByRole('button', { name: /Iniciar sesión/ }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret123',
      });
    });
    expect(login).toHaveBeenCalledWith({ id: 'u1' }, 'tok');
    expect(push).toHaveBeenCalledWith('/');
  });

  it('surfaces a generic error message when login fails', async () => {
    const user = userEvent.setup();
    (authApi.login as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Credenciales inválidas' } },
    });
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText('tu@empresa.com'), 'user@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'secret123');
    await user.click(screen.getByRole('button', { name: /Iniciar sesión/ }));

    expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('LoginPage — unverified email flow', () => {
  it('offers to resend verification when the email is not verified', async () => {
    const user = userEvent.setup();
    (authApi.login as jest.Mock).mockRejectedValue({
      response: {
        data: {
          code: 'EMAIL_NOT_VERIFIED',
          email: 'user@example.com',
          message: 'Verificá tu correo',
        },
      },
    });
    (authApi.resendVerification as jest.Mock).mockResolvedValue({ data: {} });
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText('tu@empresa.com'), 'user@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'secret123');
    await user.click(screen.getByRole('button', { name: /Iniciar sesión/ }));

    const resendBtn = await screen.findByRole('button', {
      name: 'Reenviar correo de verificación',
    });
    await user.click(resendBtn);
    expect(authApi.resendVerification).toHaveBeenCalledWith('user@example.com');
    expect(await screen.findByText(/Correo enviado/)).toBeInTheDocument();
  });
});
