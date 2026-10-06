import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import CarrierDashboard from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/carrier',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  tripsApi: { getMy: jest.fn(), getMetrics: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { tripsApi } = require('@/lib/api') as {
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

const monthly = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, '0')}`,
  amount: i === 11 ? 300000 : 0,
  trips: i === 11 ? 2 : 0,
  km: i === 11 ? 700 : 0,
}));

const metrics = {
  avgKmPerLiter: 3.5,
  litersThisMonth: 200,
  kmThisMonth: 700,
  onTimeDeliveries: 4,
  lateDeliveries: 1,
  onTimeRate: 0.8,
  totalFuelLiters: 500,
  totalDistanceKm: 2000,
  totalAmount: 1200000,
  amountThisMonth: 300000,
  avgAmountPerTrip: 400000,
  amountPerKm: 1500,
  monthly,
  postulationsSent: 10,
  postulationsAccepted: 3,
  postulationAcceptanceRate: 0.3,
  avgRating: 4.5,
  ratingsCount: 6,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth({ isAuthenticated: true, user: { id: 'c1', role: 'TRANSPORTER' } });
});

describe('CarrierDashboard', () => {
  it('computes trip stats by status', async () => {
    tripsApi.getMy.mockResolvedValue({
      data: {
        trips: [
          { id: 't1', status: 'IN_PROGRESS', load: { title: 'Trip A' } },
          { id: 't2', status: 'ACCEPTED', load: { title: 'Trip B' } },
          { id: 't3', status: 'COMPLETED', load: { title: 'Trip C' } },
          { id: 't4', status: 'COMPLETED', load: { title: 'Trip D' } },
        ],
      },
    });
    // null metrics to avoid colliding numeric text with the trip stat cards.
    tripsApi.getMetrics.mockResolvedValue({ data: null });

    renderWithClient(<CarrierDashboard />);

    // The in-progress trip wins the hero slot (it's the most urgent one).
    expect(await screen.findByText('Trip A')).toBeInTheDocument();
    // The accepted trip is folded into the "ver todos" link, not repeated by name.
    expect(screen.getByText(/1 viaje más en curso/)).toBeInTheDocument();
    expect(screen.queryByText('Trip B')).not.toBeInTheDocument();
    // A trip already IN_PROGRESS gets a tracking CTA, not a "start it" one.
    expect(screen.getByRole('link', { name: /Ver seguimiento/ })).toHaveAttribute('href', '/trips/t1');
    // Total = 4 trips.
    expect(screen.getByText('4')).toBeInTheDocument();
    // One IN_PROGRESS + one ACCEPTED + two COMPLETED → "1" appears for active.
    const stat1s = screen.getAllByText('1');
    expect(stat1s.length).toBeGreaterThanOrEqual(1);
  });

  it('shows the active trip as a full-width hero with route and a status-aware CTA', async () => {
    tripsApi.getMy.mockResolvedValue({
      data: {
        trips: [
          {
            id: 't1',
            status: 'ACCEPTED',
            load: {
              title: 'Trip A',
              originAddress: 'Rosario',
              destAddress: 'Cordoba',
            },
          },
        ],
      },
    });
    tripsApi.getMetrics.mockResolvedValue({ data: null });

    renderWithClient(<CarrierDashboard />);

    // Kept deliberately minimal — just enough to identify the trip and act on
    // it. Cargo type, weight and price stay one click away in the trip detail.
    expect(await screen.findByText('Trip A')).toBeInTheDocument();
    expect(screen.getByText(/Rosario/)).toBeInTheDocument();
    expect(screen.getByText(/Cordoba/)).toBeInTheDocument();
    // A trip that hasn't started yet gets a "start it" CTA, not a tracking link.
    expect(screen.getByRole('link', { name: /Iniciar viaje/ })).toHaveAttribute('href', '/trips/t1');
  });

  it('renders performance metrics', async () => {
    tripsApi.getMy.mockResolvedValue({ data: { trips: [] } });
    tripsApi.getMetrics.mockResolvedValue({ data: metrics });

    renderWithClient(<CarrierDashboard />);

    // Performance stats are collapsed behind a toggle by default to declutter the panel.
    fireEvent.click(await screen.findByRole('button', { name: /Ver métricas/ }));

    expect(await screen.findByText('3.5 km/L')).toBeInTheDocument();
    expect(screen.getByText('200 L')).toBeInTheDocument();
    expect(screen.getByText('80% de las medibles')).toBeInTheDocument();
    expect(screen.getByText('700 km recorridos')).toBeInTheDocument();
  });

  it('shows empty states when nothing is available', async () => {
    tripsApi.getMy.mockResolvedValue({ data: { trips: [] } });
    tripsApi.getMetrics.mockResolvedValue({ data: metrics });

    renderWithClient(<CarrierDashboard />);

    // No active trips → the hero collapses to a lightweight prompt instead of an empty list.
    expect(await screen.findByText('Sin viajes activos')).toBeInTheDocument();
    expect(
      screen.getByText('Postulate a una carga disponible para arrancar un viaje.'),
    ).toBeInTheDocument();
  });

it('renders income metrics and the postulation conversion', async () => {
    tripsApi.getMy.mockResolvedValue({ data: { trips: [] } });
    tripsApi.getMetrics.mockResolvedValue({ data: metrics });

    renderWithClient(<CarrierDashboard />);

    // Los ingresos van visibles sin desplegar nada: es la razón de manejar.
    expect(await screen.findByText(/1\.200\.000/)).toBeInTheDocument();
    expect(screen.getByText(/2 viajes cerrados/)).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('3 de 10')).toBeInTheDocument();
  });

  it('computes the fuel margin from the price the carrier types', async () => {
    tripsApi.getMy.mockResolvedValue({ data: { trips: [] } });
    tripsApi.getMetrics.mockResolvedValue({ data: metrics });

    renderWithClient(<CarrierDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: /Ver métricas/ }));
    fireEvent.change(screen.getByPlaceholderText('1500'), { target: { value: '1000' } });

    // 500 L x $1000 = $500.000 de combustible → quedan $700.000 de $1.200.000.
    expect(await screen.findByText(/500\.000/)).toBeInTheDocument();
    expect(screen.getByText(/700\.000/)).toBeInTheDocument();
    // 700.000 / 2000 km = $350 por km.
    expect(screen.getByText(/350.*por km/)).toBeInTheDocument();
  });

  it('keeps available loads and postulations off the panel', async () => {
    // Ambos listados tienen su propio ítem en el sidebar (/loads y /postulations);
    // repetirlos acá duplicaba la misma lista a un scroll de distancia.
    tripsApi.getMy.mockResolvedValue({ data: { trips: [] } });
    tripsApi.getMetrics.mockResolvedValue({ data: metrics });

    renderWithClient(<CarrierDashboard />);

    await screen.findByText('Sin viajes activos');
    expect(screen.queryByText('Para tomar')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Cargas disponibles' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Tus postulaciones')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Mis postulaciones/ }),
    ).not.toBeInTheDocument();
  });
});
