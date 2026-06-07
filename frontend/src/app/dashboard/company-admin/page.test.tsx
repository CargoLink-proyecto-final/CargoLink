import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import CompanyAdminDashboard from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/company-admin',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  companiesApi: {
    getMyCompany: jest.fn(),
    getTrips: jest.fn(),
    getRequests: jest.fn(),
    decideRequest: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { companiesApi } = require('@/lib/api') as {
  companiesApi: Record<string, jest.Mock>;
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
  mockAuth({ isAuthenticated: true, user: { id: 'ca1', role: 'TRANSPORTER' } });
});

describe('CompanyAdminDashboard', () => {
  it('renders company name and overview stats', async () => {
    companiesApi.getMyCompany.mockResolvedValue({
      data: { name: 'Acme Fleet', memberCount: 8, pendingRequests: 2 },
    });
    companiesApi.getTrips.mockResolvedValue({
      data: {
        trips: [
          { id: 't1', status: 'IN_PROGRESS', load: { title: 'T1' }, carrier: { firstName: 'A', lastName: 'B' } },
          { id: 't2', status: 'COMPLETED', load: { title: 'T2' }, carrier: { firstName: 'C', lastName: 'D' } },
        ],
      },
    });
    companiesApi.getRequests.mockResolvedValue({ data: [] });

    renderWithClient(<CompanyAdminDashboard />);

    expect(await screen.findByText('Acme Fleet')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument(); // member count
    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByText('T2')).toBeInTheDocument();
  });

  it('lists pending join requests', async () => {
    companiesApi.getMyCompany.mockResolvedValue({
      data: { name: 'Acme', memberCount: 1, pendingRequests: 1 },
    });
    companiesApi.getTrips.mockResolvedValue({ data: { trips: [] } });
    companiesApi.getRequests.mockResolvedValue({
      data: [
        {
          id: 'r1',
          status: 'PENDING',
          createdAt: '2026-01-01T00:00:00.000Z',
          transporter: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
        },
      ],
    });

    renderWithClient(<CompanyAdminDashboard />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('approves a pending request from the inbox', async () => {
    const user = userEvent.setup();
    companiesApi.getMyCompany.mockResolvedValue({
      data: { name: 'Acme', memberCount: 1, pendingRequests: 1 },
    });
    companiesApi.getTrips.mockResolvedValue({ data: { trips: [] } });
    companiesApi.getRequests.mockResolvedValue({
      data: [
        {
          id: 'r1',
          status: 'PENDING',
          createdAt: '2026-01-01T00:00:00.000Z',
          transporter: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
        },
      ],
    });
    companiesApi.decideRequest.mockResolvedValue({ data: {} });

    renderWithClient(<CompanyAdminDashboard />);

    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: /Aprobar/ }));

    await waitFor(() =>
      expect(companiesApi.decideRequest).toHaveBeenCalledWith('r1', 'APPROVE'),
    );
  });

  it('shows empty states when there are no requests or trips', async () => {
    companiesApi.getMyCompany.mockResolvedValue({
      data: { name: 'Acme', memberCount: 0, pendingRequests: 0 },
    });
    companiesApi.getTrips.mockResolvedValue({ data: { trips: [] } });
    companiesApi.getRequests.mockResolvedValue({ data: [] });

    renderWithClient(<CompanyAdminDashboard />);

    expect(await screen.findByText('No hay solicitudes pendientes.')).toBeInTheDocument();
    expect(screen.getByText('La flota no tiene viajes aún.')).toBeInTheDocument();
  });
});
