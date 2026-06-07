import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import AdminDashboard from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/admin',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

// Isolate the layout from Sidebar's own data fetching.
jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  usersApi: { getAll: jest.fn() },
  loadsApi: { getAll: jest.fn() },
  tripsApi: { getAll: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { usersApi, loadsApi, tripsApi } = require('@/lib/api') as {
  usersApi: Record<string, jest.Mock>;
  loadsApi: Record<string, jest.Mock>;
  tripsApi: Record<string, jest.Mock>;
};

function mockAuth(state: Record<string, unknown>) {
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel?: (s: unknown) => unknown) =>
    sel ? sel(state) : state,
  );
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth({ isAuthenticated: true, user: { id: 'a1', role: 'ADMIN' } });
});

describe('AdminDashboard', () => {
  it('renders platform-wide stats from the totals', async () => {
    usersApi.getAll.mockResolvedValue({
      data: { total: 42, users: [] },
    });
    loadsApi.getAll.mockResolvedValue({
      data: { total: 17, loads: [] },
    });
    tripsApi.getAll.mockResolvedValue({
      data: {
        total: 9,
        trips: [
          { id: 't1', status: 'IN_PROGRESS' },
          { id: 't2', status: 'COMPLETED' },
          { id: 't3', status: 'IN_PROGRESS' },
        ],
      },
    });

    renderWithClient(<AdminDashboard />);

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    // Two IN_PROGRESS trips → "Viajes activos" = 2.
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('lists recent users and loads', async () => {
    usersApi.getAll.mockResolvedValue({
      data: {
        total: 2,
        users: [
          {
            id: 'u1',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            role: 'TRANSPORTER',
            isActive: true,
          },
          {
            id: 'u2',
            firstName: 'Grace',
            lastName: 'Hopper',
            email: 'grace@example.com',
            role: 'CARGO_GENERATOR',
            isActive: false,
          },
        ],
      },
    });
    loadsApi.getAll.mockResolvedValue({
      data: {
        total: 1,
        loads: [
          {
            id: 'l1',
            title: 'Steel coils',
            status: 'PUBLISHED',
            shipper: { firstName: 'Alan', lastName: 'Turing' },
          },
        ],
      },
    });
    tripsApi.getAll.mockResolvedValue({ data: { total: 0, trips: [] } });

    renderWithClient(<AdminDashboard />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Steel coils')).toBeInTheDocument();
  });

  it('falls back to zeros before data resolves and requests with limit 100', async () => {
    usersApi.getAll.mockResolvedValue({ data: { total: 0, users: [] } });
    loadsApi.getAll.mockResolvedValue({ data: { total: 0, loads: [] } });
    tripsApi.getAll.mockResolvedValue({ data: { total: 0, trips: [] } });

    renderWithClient(<AdminDashboard />);

    await waitFor(() => expect(usersApi.getAll).toHaveBeenCalledWith({ limit: 100 }));
    expect(loadsApi.getAll).toHaveBeenCalledWith({ limit: 100 });
    expect(tripsApi.getAll).toHaveBeenCalledWith({ limit: 100 });
  });
});
