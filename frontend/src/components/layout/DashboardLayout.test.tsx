import { render, screen } from '@testing-library/react';
import DashboardLayout from './DashboardLayout';
import { useAuthStore } from '@/store/auth';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

// Isolate the layout from Sidebar's data fetching.
jest.mock('./Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

function mockAuth(state: Record<string, unknown>) {
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel?: (s: unknown) => unknown) =>
    sel ? sel(state) : state,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DashboardLayout', () => {
  it('renders children and the sidebar when authenticated', () => {
    mockAuth({ isAuthenticated: true });
    render(
      <DashboardLayout>
        <p>Protected content</p>
      </DashboardLayout>,
    );
    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('does not redirect when authenticated', () => {
    mockAuth({ isAuthenticated: true });
    render(
      <DashboardLayout>
        <p>Protected content</p>
      </DashboardLayout>,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders null and redirects to login when not authenticated', () => {
    mockAuth({ isAuthenticated: false });
    render(
      <DashboardLayout>
        <p>Protected content</p>
      </DashboardLayout>,
    );
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/auth/login');
  });
});
