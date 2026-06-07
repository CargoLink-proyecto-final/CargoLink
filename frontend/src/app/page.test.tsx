import { render } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import Home from './page';
import { useAuthStore } from '@/store/auth';

const replace = jest.fn();
const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

function mockAuth(state: Record<string, unknown>) {
  (useAuthStore as unknown as jest.Mock).mockImplementation(
    (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Home (role-based redirect)', () => {
  it('redirects unauthenticated users to /auth/login', async () => {
    mockAuth({ isAuthenticated: false, user: null });
    render(<Home />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/login'));
  });

  it('redirects ADMIN to /dashboard/admin', async () => {
    mockAuth({ isAuthenticated: true, user: { role: 'ADMIN' } });
    render(<Home />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/admin'));
  });

  it('redirects CARGO_GENERATOR to /dashboard/shipper', async () => {
    mockAuth({ isAuthenticated: true, user: { role: 'CARGO_GENERATOR' } });
    render(<Home />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/shipper'));
  });

  it('redirects TRANSPORTER to /dashboard/carrier', async () => {
    mockAuth({ isAuthenticated: true, user: { role: 'TRANSPORTER' } });
    render(<Home />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/carrier'));
  });

  it('redirects COMPANY_ADMIN to /dashboard/company-admin', async () => {
    mockAuth({ isAuthenticated: true, user: { role: 'COMPANY_ADMIN' } });
    render(<Home />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/dashboard/company-admin'),
    );
  });

  it('falls back to /auth/login for an authenticated user with an unknown role', async () => {
    mockAuth({ isAuthenticated: true, user: { role: 'WHATEVER' } });
    render(<Home />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/login'));
  });

  it('renders the loading spinner while redirecting', () => {
    mockAuth({ isAuthenticated: true, user: { role: 'ADMIN' } });
    const { container } = render(<Home />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
