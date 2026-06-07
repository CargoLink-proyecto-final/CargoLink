import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from './page';
import { usersApi } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/users',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

jest.mock('@/store/auth', () => ({
  useAuthStore: (sel?: (s: any) => any) => {
    const state = { user: { id: 'admin', role: 'ADMIN' }, isAuthenticated: true };
    return sel ? sel(state) : state;
  },
}));

jest.mock('@/lib/api', () => ({
  usersApi: {
    getAll: jest.fn(),
    toggleActive: jest.fn(),
  },
}));

const getAll = usersApi.getAll as jest.Mock;
const toggleActive = usersApi.toggleActive as jest.Mock;

function makeUser(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@cargolink.com',
    role: 'TRANSPORTER',
    companyName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getAll.mockResolvedValue({
    data: {
      users: [
        makeUser({ id: 'u1', firstName: 'Ada', email: 'ada@cargolink.com', isActive: true }),
        makeUser({
          id: 'u2',
          firstName: 'Grace',
          lastName: 'Hopper',
          email: 'grace@cargolink.com',
          role: 'ADMIN',
          isActive: false,
        }),
      ],
      page: 1,
      totalPages: 1,
    },
  });
  toggleActive.mockResolvedValue({ data: {} });
});

describe('UsersPage (admin)', () => {
  it('lists users returned by usersApi.getAll', async () => {
    renderPage();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('ada@cargolink.com')).toBeInTheDocument();
    await waitFor(() => expect(getAll).toHaveBeenCalled());
  });

  it('shows active/inactive status and the matching action label', async () => {
    renderPage();
    await screen.findByText('Ada Lovelace');
    // Active user → "Desactivar"; inactive user → "Activar" (anchored so
    // "Desactivar" doesn't also match the "Activar" substring).
    expect(screen.getByRole('button', { name: /^Desactivar$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Activar$/i })).toBeInTheDocument();
  });

  it('calls toggleActive with the user id when the action is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: /Desactivar/i }));
    await waitFor(() => expect(toggleActive).toHaveBeenCalledWith('u1'));
  });

  it('filters the table client-side by the search box', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByPlaceholderText('Buscar usuarios...'), 'grace');

    await waitFor(() =>
      expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });
});
