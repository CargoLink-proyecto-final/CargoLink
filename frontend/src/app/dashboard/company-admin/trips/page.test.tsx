import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import CompanyTripsPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/company-admin/trips',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  companiesApi: {
    getDrivers: jest.fn(),
    getTrips: jest.fn(),
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

const drivers = [
  { id: 'd1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: null },
];

const trips = [
  {
    id: 't1',
    status: 'IN_PROGRESS',
    createdAt: '2026-01-01T00:00:00.000Z',
    load: { title: 'Steel coils', originAddress: 'Rosario', destAddress: 'Cordoba', price: 1500 },
    carrier: { firstName: 'Grace', lastName: 'Hopper' },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth({ isAuthenticated: true, user: { id: 'ca1', role: 'TRANSPORTER' } });
});

describe('CompanyTripsPage', () => {
  it('lists company trips with their total count', async () => {
    companiesApi.getDrivers.mockResolvedValue({ data: drivers });
    companiesApi.getTrips.mockResolvedValue({ data: { trips, total: 1 } });

    renderWithClient(<CompanyTripsPage />);

    expect(await screen.findByText('Steel coils')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument(); // trip carrier
    expect(screen.getByText('1')).toBeInTheDocument(); // total
  });

  it('requests trips with default (no) filters and limit 50', async () => {
    companiesApi.getDrivers.mockResolvedValue({ data: drivers });
    companiesApi.getTrips.mockResolvedValue({ data: { trips, total: 1 } });

    renderWithClient(<CompanyTripsPage />);

    await waitFor(() =>
      expect(companiesApi.getTrips).toHaveBeenCalledWith({
        status: undefined,
        driverId: undefined,
        from: undefined,
        to: undefined,
        limit: 50,
      }),
    );
  });

  it('refetches with the chosen status filter', async () => {
    const user = userEvent.setup();
    companiesApi.getDrivers.mockResolvedValue({ data: drivers });
    companiesApi.getTrips.mockResolvedValue({ data: { trips, total: 1 } });

    renderWithClient(<CompanyTripsPage />);

    await screen.findByText('Steel coils');
    // The status select is the first combobox.
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'COMPLETED');

    await waitFor(() =>
      expect(companiesApi.getTrips).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'COMPLETED' }),
      ),
    );
  });

  it('populates the driver filter from the drivers list', async () => {
    const user = userEvent.setup();
    companiesApi.getDrivers.mockResolvedValue({ data: drivers });
    companiesApi.getTrips.mockResolvedValue({ data: { trips, total: 1 } });

    renderWithClient(<CompanyTripsPage />);

    await screen.findByText('Steel coils');
    // Driver select is the second combobox; it has an option for "Ada Lovelace".
    await user.selectOptions(screen.getAllByRole('combobox')[1], 'd1');

    await waitFor(() =>
      expect(companiesApi.getTrips).toHaveBeenCalledWith(
        expect.objectContaining({ driverId: 'd1' }),
      ),
    );
  });

  it('shows the empty state when no trips match', async () => {
    companiesApi.getDrivers.mockResolvedValue({ data: drivers });
    companiesApi.getTrips.mockResolvedValue({ data: { trips: [], total: 0 } });

    renderWithClient(<CompanyTripsPage />);

    expect(
      await screen.findByText('No hay viajes que coincidan con los filtros.'),
    ).toBeInTheDocument();
  });
});
