import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordPage from './page';
import { authApi } from '@/lib/api';

const push = jest.fn();

declare global {
  // eslint-disable-next-line no-var
  var __sp: string | undefined;
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/auth/reset-password',
  useSearchParams: () => new URLSearchParams(globalThis.__sp ?? ''),
}));

jest.mock('@/lib/api', () => ({
  authApi: {
    resetPassword: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  globalThis.__sp = 'token=abc123';
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  globalThis.__sp = undefined;
});

const passwordInputs = () =>
  Array.from(
    document.querySelectorAll('input[type="password"]'),
  ) as HTMLInputElement[];

describe('ResetPasswordPage — invalid token', () => {
  it('shows the invalid-link state when no token is present', () => {
    globalThis.__sp = '';
    render(<ResetPasswordPage />);
    expect(screen.getByRole('heading', { name: 'Enlace inválido' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Solicitar nuevo enlace' })).toBeInTheDocument();
  });
});

describe('ResetPasswordPage — with token', () => {
  it('renders the new-password form', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByRole('heading', { name: /Nueva/ })).toBeInTheDocument();
    expect(passwordInputs()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeInTheDocument();
  });

  it('blocks empty submit with required messages', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<ResetPasswordPage />);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('La contraseña es obligatoria')).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<ResetPasswordPage />);
    const [pw, confirm] = passwordInputs();
    await user.type(pw, 'secret123');
    await user.type(confirm, 'different9');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it('calls authApi.resetPassword with the token and redirects on success', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    (authApi.resetPassword as jest.Mock).mockResolvedValue({ data: {} });
    render(<ResetPasswordPage />);
    const [pw, confirm] = passwordInputs();
    await user.type(pw, 'secret123');
    await user.type(confirm, 'secret123');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    await waitFor(() =>
      expect(authApi.resetPassword).toHaveBeenCalledWith('abc123', 'secret123'),
    );
    expect(await screen.findByText('Contraseña actualizada')).toBeInTheDocument();

    jest.advanceTimersByTime(3000);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'));
  });

  it('surfaces an error message when the token is expired/used', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    (authApi.resetPassword as jest.Mock).mockRejectedValue({
      response: { data: { message: 'El enlace expiró' } },
    });
    render(<ResetPasswordPage />);
    const [pw, confirm] = passwordInputs();
    await user.type(pw, 'secret123');
    await user.type(confirm, 'secret123');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('El enlace expiró')).toBeInTheDocument();
    expect(screen.queryByText('Contraseña actualizada')).not.toBeInTheDocument();
  });
});
