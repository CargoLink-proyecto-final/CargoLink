import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import type { PlatformMetrics } from '@/types/adminMetrics';
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
  adminMetricsApi: { getPlatform: jest.fn(), getSystemHealth: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { usersApi, loadsApi, adminMetricsApi } = require('@/lib/api') as {
  usersApi: Record<string, jest.Mock>;
  loadsApi: Record<string, jest.Mock>;
  adminMetricsApi: Record<string, jest.Mock>;
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

const METRICS: PlatformMetrics = {
  generatedAt: '2026-10-15T12:00:00.000Z',
  windowDays: 90,
  users: {
    byRole: { CARGO_GENERATOR: 12, TRANSPORTER: 30, ADMIN: 1 },
    total: 43,
    activeLast30Days: { shippers: 5, transporters: 14 },
    monthlySignups: [
      { month: '2026-09', byRole: { CARGO_GENERATOR: 1, TRANSPORTER: 2, COMPANY_ADMIN: 0 }, total: 3 },
      { month: '2026-10', byRole: { CARGO_GENERATOR: 0, TRANSPORTER: 4, COMPANY_ADMIN: 1 }, total: 5 },
    ],
  },
  now: { loadsOpen: 7, tripsInProgress: 3 },
  marketplace: {
    loadsPublished: 40,
    assignmentRate: 0.75,
    avgPostulationsPerLoad: 2.4,
    medianHoursToFirstPostulation: 5.5,
    counterOfferRate: 0.3,
    unansweredLoads: [
      { id: 'l9', title: 'Maíz a Rosario', shipperName: 'Agro SA', createdAt: '2026-10-10T12:00:00.000Z', hoursWaiting: 120 },
    ],
  },
  trips: {
    volumeThisMonth: 1_250_000,
    tripsCompletedThisMonth: 11,
    monthlyVolume: [
      { month: '2026-09', amount: 900_000, trips: 8 },
      { month: '2026-10', amount: 1_250_000, trips: 11 },
    ],
    avgPricePerKm: 1500,
    onTimeRate: 0.65,
    cancellationRate: 0.05,
    avgTripHours: 20,
  },
  verification: {
    pendingDocuments: 4,
    stalePendingDocuments: 2,
    oldestPendingAt: '2026-10-11T12:00:00.000Z',
    avgReviewHours: 10,
    rejectionRate: 0.2,
  },
  expiryAlerts: [
    { userId: 'u7', userName: 'Ana Gómez', kind: 'VTV', expiresAt: '2026-10-12T00:00:00.000Z', daysLeft: -3 },
    { userId: 'u8', userName: 'Beto Ruiz', kind: 'LICENSE', expiresAt: '2026-10-25T00:00:00.000Z', daysLeft: 10 },
  ],
  ratings: { average: 4.6, count: 25 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth({ isAuthenticated: true, user: { id: 'a1', role: 'ADMIN' } });
  usersApi.getAll.mockResolvedValue({ data: { total: 0, users: [] } });
  loadsApi.getAll.mockResolvedValue({ data: { total: 0, loads: [] } });
  adminMetricsApi.getPlatform.mockResolvedValue({ data: METRICS });
  adminMetricsApi.getSystemHealth.mockResolvedValue({ data: { status: 'OK', reasons: [] } });
});

describe('AdminDashboard', () => {
  it('shows the four headline KPIs from the platform metrics', async () => {
    renderWithClient(<AdminDashboard />);

    expect(await screen.findByText('$1,3 M')).toBeInTheDocument();
    expect(screen.getByText('11 viajes completados')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('De 40 publicadas en 90 días')).toBeInTheDocument();
    // 65% está debajo del objetivo de 80%: se avisa.
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('Debajo del objetivo de 80%')).toBeInTheDocument();
    expect(screen.getByText('2 esperan hace más de 48 h')).toBeInTheDocument();
  });

  it('shows what is happening right now from database counts', async () => {
    renderWithClient(<AdminDashboard />);

    expect(await screen.findByText('Cargas esperando transportista')).toBeInTheDocument();
    expect(screen.getByText('Viajes en curso').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('5 publicadores · 14 transportistas')).toBeInTheDocument();
    expect(screen.getByText('4,6 ★')).toBeInTheDocument();
  });

  it('lists loads nobody applied to and papers about to expire, linking to act on them', async () => {
    renderWithClient(<AdminDashboard />);

    const load = await screen.findByText('Maíz a Rosario');
    expect(load.closest('a')).toHaveAttribute('href', '/loads/l9');
    expect(screen.getByText('5 días')).toBeInTheDocument();

    expect(screen.getByText('Vencido hace 3 d')).toBeInTheDocument();
    expect(screen.getByText('Vence en 10 d').closest('a')).toHaveAttribute(
      'href',
      '/dashboard/admin/verifications/u8',
    );
  });

  it('links to the system page with the current system status', async () => {
    renderWithClient(<AdminDashboard />);

    const pill = await screen.findByText('Operativo');
    expect(pill.closest('a')).toHaveAttribute('href', '/dashboard/admin/system');
  });

  it('shows an error instead of zeros when the metrics cannot be loaded', async () => {
    adminMetricsApi.getPlatform.mockRejectedValue(new Error('500'));
    renderWithClient(<AdminDashboard />);

    expect(await screen.findByText('No se pudieron cargar las métricas de la plataforma.')).toBeInTheDocument();
    expect(screen.queryByText('Movido este mes')).not.toBeInTheDocument();
  });

  it('lists recent users and loads', async () => {
    usersApi.getAll.mockResolvedValue({
      data: {
        total: 2,
        users: [
          { id: 'u1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', role: 'TRANSPORTER', isActive: true },
          { id: 'u2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', role: 'CARGO_GENERATOR', isActive: false },
        ],
      },
    });
    loadsApi.getAll.mockResolvedValue({
      data: {
        total: 1,
        loads: [{ id: 'l1', title: 'Steel coils', status: 'PUBLISHED', shipper: { firstName: 'Alan', lastName: 'Turing' } }],
      },
    });

    renderWithClient(<AdminDashboard />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Steel coils')).toBeInTheDocument();
  });

  it('only requests the 8 users and loads it shows', async () => {
    renderWithClient(<AdminDashboard />);

    await waitFor(() => expect(usersApi.getAll).toHaveBeenCalledWith({ limit: 8 }));
    expect(loadsApi.getAll).toHaveBeenCalledWith({ limit: 8 });
  });
});
