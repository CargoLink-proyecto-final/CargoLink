import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import DriverStatsPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ id: 'd1' }),
  usePathname: () => '/dashboard/company-admin/drivers/d1',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  companiesApi: { getDriverStats: jest.fn() },
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

const stats = {
  driver: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
  totalTrips: 12,
  completedTrips: 9,
  activeTrips: 2,
  onTimeRate: 0.75,
  onTimeDeliveries: 6,
  lateDeliveries: 2,
  avgKmPerLiter: 3.2,
  litersThisMonth: 150,
  kmThisMonth: 480,
  avgRating: 4.6,
  ratingsCount: 11,
  totalRevenue: 50000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth({ isAuthenticated: true, user: { id: 'ca1', role: 'TRANSPORTER' } });
});

describe('DriverStatsPage', () => {
  it('fetches stats for the driver id from the route param', async () => {
    companiesApi.getDriverStats.mockResolvedValue({ data: stats });

    renderWithClient(<DriverStatsPage />);

    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(companiesApi.getDriverStats).toHaveBeenCalledWith('d1');
  });

  it('renders the driver stat cards', async () => {
    companiesApi.getDriverStats.mockResolvedValue({ data: stats });

    renderWithClient(<DriverStatsPage />);

    expect(await screen.findByText('12')).toBeInTheDocument(); // total trips
    expect(screen.getByText('9')).toBeInTheDocument(); // completed
    expect(screen.getByText('75%')).toBeInTheDocument(); // on-time rate
    expect(screen.getByText('3.2 km/L')).toBeInTheDocument();
    expect(screen.getByText('4.6')).toBeInTheDocument(); // avg rating
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('renders an error state when the query fails', async () => {
    companiesApi.getDriverStats.mockRejectedValue(new Error('boom'));

    renderWithClient(<DriverStatsPage />);

    expect(
      await screen.findByText('No se pudo cargar el rendimiento de este conductor.'),
    ).toBeInTheDocument();
  });
});
