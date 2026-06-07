import { render, screen, waitFor } from '@testing-library/react';
import VerifyEmailPage from './page';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const push = jest.fn();

declare global {
  // eslint-disable-next-line no-var
  var __sp: string | undefined;
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/auth/verify-email',
  useSearchParams: () => new URLSearchParams(globalThis.__sp ?? ''),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/lib/api', () => ({
  authApi: {
    verifyEmail: jest.fn(),
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
  jest.useFakeTimers();
  mockAuth();
  globalThis.__sp = 'token=verify-token';
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  globalThis.__sp = undefined;
});

describe('VerifyEmailPage — missing token', () => {
  it('shows the error state when no token is in the URL', async () => {
    globalThis.__sp = '';
    render(<VerifyEmailPage />);
    expect(
      await screen.findByText('Falta el token de verificación en el enlace.'),
    ).toBeInTheDocument();
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });
});

describe('VerifyEmailPage — success', () => {
  it('calls authApi.verifyEmail with the token, logs in and redirects', async () => {
    (authApi.verifyEmail as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1' }, accessToken: 'tok' },
    });
    render(<VerifyEmailPage />);

    await waitFor(() =>
      expect(authApi.verifyEmail).toHaveBeenCalledWith('verify-token'),
    );
    expect(await screen.findByText('¡Cuenta verificada!')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith({ id: 'u1' }, 'tok');

    jest.advanceTimersByTime(1500);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });
});

describe('VerifyEmailPage — error', () => {
  it('shows an error message when verification fails', async () => {
    (authApi.verifyEmail as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Enlace inválido o expirado.' } },
    });
    render(<VerifyEmailPage />);

    expect(
      await screen.findByText('No pudimos verificar tu cuenta'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enlace inválido o expirado.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
