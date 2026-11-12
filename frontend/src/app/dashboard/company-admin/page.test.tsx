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
    getMyCompanyMetrics: jest.fn(),
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
  companiesApi.getMyCompanyMetrics.mockResolvedValue({ data: null });
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

  it('renders fleet billing, utilization and the driver ranking', async () => {
    companiesApi.getMyCompany.mockResolvedValue({
      data: { name: 'Acme Fleet', memberCount: 2, pendingRequests: 0 },
    });
    companiesApi.getTrips.mockResolvedValue({ data: { trips: [] } });
    companiesApi.getRequests.mockResolvedValue({ data: [] });
    companiesApi.getMyCompanyMetrics.mockResolvedValue({
      data: {
        driverCount: 2,
        activeDriverCount: 1,
        idleDriverCount: 1,
        utilizationRate: 0.5,
        totalTrips: 3,
        completedTrips: 2,
        activeTrips: 1,
        onTimeDeliveries: 2,
        lateDeliveries: 0,
        onTimeRate: 1,
        totalDistanceKm: 600,
        totalFuelLiters: 120,
        avgKmPerLiter: 5,
        litersThisMonth: 20,
        kmThisMonth: 100,
        monthLabel: '2026-09',
        totalAmount: 2500,
        amountThisMonth: 2000,
        avgAmountPerTrip: 1250,
        amountPerKm: 4.17,
        monthly: [],
        driverRanking: [
          {
            id: 'd1',
            name: 'Ana Perez',
            avatarUrl: null,
            totalTrips: 2,
            completedTrips: 1,
            activeTrips: 1,
            totalAmount: 2000,
            amountThisMonth: 2000,
            amountPerKm: 4,
            totalDistanceKm: 500,
            avgKmPerLiter: 5,
            onTimeRate: 1,
            lateDeliveries: 0,
            avgRating: 4.5,
            ratingsCount: 8,
            lastCompletedAt: null,
            idle: false,
          },
          {
            id: 'd2',
            name: 'Beto Perez',
            avatarUrl: null,
            totalTrips: 1,
            completedTrips: 1,
            activeTrips: 0,
            totalAmount: 500,
            amountThisMonth: 0,
            amountPerKm: 5,
            totalDistanceKm: 100,
            avgKmPerLiter: 5,
            onTimeRate: null,
            lateDeliveries: 0,
            avgRating: null,
            ratingsCount: 0,
            lastCompletedAt: null,
            idle: true,
          },
        ],
      },
    });

    renderWithClient(<CompanyAdminDashboard />);

    expect(await screen.findByText('5 km/L')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('1 de 2 con viaje en curso')).toBeInTheDocument();
    expect(screen.getByText('2 a tiempo · 0 demoradas')).toBeInTheDocument();
    // El ranking lleva a la ficha del conductor.
    expect(screen.getByRole('link', { name: 'Ana Perez' })).toHaveAttribute(
      'href',
      '/dashboard/company-admin/drivers/d1',
    );
    expect(screen.getByText(/1 viaje · 5 km\/L · 100% a tiempo/)).toBeInTheDocument();
    expect(screen.getByText(/sin actividad hace 30 días/)).toBeInTheDocument();
  });
});
