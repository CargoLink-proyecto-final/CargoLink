import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import ShipperDashboard from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/shipper',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  loadsApi: { getMy: jest.fn(), getMetrics: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadsApi } = require('@/lib/api') as {
  loadsApi: Record<string, jest.Mock>;
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
  mockAuth({ isAuthenticated: true, user: { id: 's1', role: 'CARGO_GENERATOR' } });
  loadsApi.getMetrics.mockResolvedValue({ data: null });
});

describe('ShipperDashboard', () => {
  it('computes load stats by status', async () => {
    loadsApi.getMy.mockResolvedValue({
      data: {
        loads: [
          { id: 'l1', title: 'Load A', status: 'PUBLISHED', price: 1000, originAddress: 'A', destAddress: 'B' },
          { id: 'l2', title: 'Load B', status: 'IN_TRANSIT', price: 2000, originAddress: 'C', destAddress: 'D' },
          { id: 'l3', title: 'Load C', status: 'DELIVERED', price: 3000, originAddress: 'E', destAddress: 'F' },
        ],
      },
    });

    renderWithClient(<ShipperDashboard />);

    // Total = 3
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('Load A')).toBeInTheDocument();
    expect(screen.getByText('Load B')).toBeInTheDocument();
    expect(screen.getByText('Load C')).toBeInTheDocument();
  });

  it('shows the pending postulations badge when count > 0', async () => {
    loadsApi.getMy.mockResolvedValue({
      data: {
        loads: [
          {
            id: 'l1',
            title: 'Hot load',
            status: 'PUBLISHED',
            price: 5000,
            originAddress: 'A',
            destAddress: 'B',
            pendingPostulationsCount: 3,
          },
        ],
      },
    });

    renderWithClient(<ShipperDashboard />);

    expect(await screen.findByText('Hot load')).toBeInTheDocument();
    expect(screen.getByText(/3 postulaciones/)).toBeInTheDocument();
  });

  it('renders the empty state when there are no loads', async () => {
    loadsApi.getMy.mockResolvedValue({ data: { loads: [] } });

    renderWithClient(<ShipperDashboard />);

    expect(await screen.findByText('Aún no publicaste cargas')).toBeInTheDocument();
  });

  it('shows the loading state while fetching', () => {
    loadsApi.getMy.mockReturnValue(new Promise(() => {}));

    renderWithClient(<ShipperDashboard />);

    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('renders spend metrics with the carrier ranking', async () => {
    loadsApi.getMy.mockResolvedValue({ data: { loads: [] } });
    loadsApi.getMetrics.mockResolvedValue({
      data: {
        totalLoads: 10,
        publishedLoads: 2,
        assignedLoads: 1,
        inTransitLoads: 1,
        deliveredLoads: 5,
        cancelledLoads: 1,
        totalDistanceKm: 3000,
        avgNegotiationDelta: 0.15,
        negotiatedLoads: 6,
        totalAmount: 2400000,
        amountThisMonth: 400000,
        avgAmountPerTrip: 480000,
        amountPerKm: 800,
        monthly: [],
        topCarriers: [
          { id: 'c1', name: 'Transportes Sur', completedTrips: 3, totalSpend: 1500000, avgRating: 4.7 },
        ],
        spendByCargoType: [{ cargoType: 'Granos', trips: 3, amount: 1500000 }],
      },
    });

    renderWithClient(<ShipperDashboard />);

    expect(await screen.findByText(/2\.400\.000/)).toBeInTheDocument();
    // La fila de desempeño (asignación, puntualidad) se sacó: no le servía al dador.
    expect(screen.queryByText('Desempeño de tus cargas')).not.toBeInTheDocument();
    // Pagó 15% por encima de lo publicado, sobre 6 cargas con precio fijado.
    expect(screen.getByText('+15%')).toBeInTheDocument();
    expect(screen.getByText(/en 6 cargas con precio/)).toBeInTheDocument();
    expect(screen.getByText('Transportes Sur')).toBeInTheDocument();
    expect(screen.getByText(/3 viajes · 4.7 ★ que le diste/)).toBeInTheDocument();
    expect(screen.getByText('Granos')).toBeInTheDocument();
  });

  it('keeps the metric cards readable while the metrics request is in flight', async () => {
    loadsApi.getMy.mockResolvedValue({ data: { loads: [] } });
    loadsApi.getMetrics.mockRejectedValue(new Error('offline'));

    renderWithClient(<ShipperDashboard />);

    // Sin métricas no se rompe el panel: las cards muestran un guion.
    expect(await screen.findByText('Aún no publicaste cargas')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
