import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckEmailPage from './page';
import { authApi } from '@/lib/api';

declare global {
  // eslint-disable-next-line no-var
  var __sp: string | undefined;
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/auth/check-email',
  useSearchParams: () => new URLSearchParams(globalThis.__sp ?? ''),
}));

jest.mock('@/lib/api', () => ({
  authApi: {
    resendVerification: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.__sp = 'email=user%40example.com';
});

afterEach(() => {
  globalThis.__sp = undefined;
});

describe('CheckEmailPage', () => {
  it('shows the email from the query string', () => {
    render(<CheckEmailPage />);
    expect(screen.getByRole('heading', { name: 'Revisá tu correo' })).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('disables the resend button when no email is present', () => {
    globalThis.__sp = '';
    render(<CheckEmailPage />);
    expect(
      screen.getByRole('button', { name: 'Reenviar correo de verificación' }),
    ).toBeDisabled();
  });

  it('resends the verification email and shows the success message', async () => {
    const user = userEvent.setup();
    (authApi.resendVerification as jest.Mock).mockResolvedValue({
      data: { message: 'Nuevo enlace enviado' },
    });
    render(<CheckEmailPage />);
    await user.click(
      screen.getByRole('button', { name: 'Reenviar correo de verificación' }),
    );

    await waitFor(() =>
      expect(authApi.resendVerification).toHaveBeenCalledWith('user@example.com'),
    );
    expect(await screen.findByText('Nuevo enlace enviado')).toBeInTheDocument();
  });

  it('shows an error message when resending fails', async () => {
    const user = userEvent.setup();
    (authApi.resendVerification as jest.Mock).mockRejectedValue({
      response: { data: { message: 'No pudimos reenviar' } },
    });
    render(<CheckEmailPage />);
    await user.click(
      screen.getByRole('button', { name: 'Reenviar correo de verificación' }),
    );

    expect(await screen.findByText('No pudimos reenviar')).toBeInTheDocument();
  });
});
