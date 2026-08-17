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
  loadsApi: { getAvailable: jest.fn() },
  postulationsApi: { getMy: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { tripsApi, loadsApi, postulationsApi } = require('@/lib/api') as {
  tripsApi: Record<string, jest.Mock>;
  loadsApi: Record<string, jest.Mock>;
  postulationsApi: Record<string, jest.Mock>;
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

const metrics = {
  avgKmPerLiter: 3.5,
  litersThisMonth: 200,
  kmThisMonth: 700,
  onTimeDeliveries: 4,
  lateDeliveries: 1,
  onTimeRate: 0.8,
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
    loadsApi.getAvailable.mockResolvedValue({ data: { loads: [] } });
    postulationsApi.getMy.mockResolvedValue({ data: [] });
    // null metrics to avoid colliding numeric text with the trip stat cards.
    tripsApi.getMetrics.mockResolvedValue({ data: null });

    renderWithClient(<CarrierDashboard />);

    // The in-progress trip wins the hero slot (it's the most urgent one).
    expect(await screen.findByText('Trip A')).toBeInTheDocument();
    // The accepted trip is folded into the "ver todos" link, not repeated by name.
    expect(screen.getByText(/1 viaje más en curso/)).toBeInTheDocument();
    expect(screen.queryByText('Trip B')).not.toBeInTheDocument();
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
    loadsApi.getAvailable.mockResolvedValue({ data: { loads: [] } });
    postulationsApi.getMy.mockResolvedValue({ data: [] });
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
    loadsApi.getAvailable.mockResolvedValue({ data: { loads: [] } });
    postulationsApi.getMy.mockResolvedValue({ data: [] });
    tripsApi.getMetrics.mockResolvedValue({ data: metrics });

    renderWithClient(<CarrierDashboard />);

    // Performance stats are collapsed behind a toggle by default to declutter the panel.
    fireEvent.click(await screen.findByRole('button', { name: /Ver métricas/ }));

    expect(await screen.findByText('3.5 km/L')).toBeInTheDocument();
    expect(screen.getByText('200 L')).toBeInTheDocument();
    expect(screen.getByText('80% de las medibles')).toBeInTheDocument();
    expect(screen.getByText('700 km recorridos')).toBeInTheDocument();
  });

  it('renders available loads and my postulations', async () => {
    tripsApi.getMy.mockResolvedValue({ data: { trips: [] } });
    loadsApi.getAvailable.mockResolvedValue({
      data: {
        loads: [
          {
            id: 'l1',
            title: 'Available cargo',
            originAddress: 'Rosario',
            destAddress: 'Cordoba',
            price: 1500,
            weight: 1200,
          },
        ],
      },
    });
    postulationsApi.getMy.mockResolvedValue({
      data: [
        {
          id: 'p1',
          loadId: 'l9',
          status: 'PENDING',
          proposedPrice: 900,
          load: {
            title: 'My postulated load',
            originAddress: 'Salta',
            destAddress: 'Jujuy',
          },
        },
      ],
    });
    tripsApi.getMetrics.mockResolvedValue({ data: metrics });

    renderWithClient(<CarrierDashboard />);

    expect(await screen.findByText('Available cargo')).toBeInTheDocument();
    expect(screen.getByText('My postulated load')).toBeInTheDocument();
    expect(screen.getByText(/Propusiste/)).toBeInTheDocument();
  });

  it('shows empty states when nothing is available', async () => {
    tripsApi.getMy.mockResolvedValue({ data: { trips: [] } });
    loadsApi.getAvailable.mockResolvedValue({ data: { loads: [] } });
    postulationsApi.getMy.mockResolvedValue({ data: [] });
    tripsApi.getMetrics.mockResolvedValue({ data: metrics });

    renderWithClient(<CarrierDashboard />);

    expect(
      await screen.findByText('Sin cargas disponibles ahora mismo.'),
    ).toBeInTheDocument();
    // No active trips → the hero collapses to a lightweight prompt instead of an empty list.
    expect(await screen.findByText('Sin viajes activos')).toBeInTheDocument();
    expect(
      screen.getByText('Postulate a una carga disponible para arrancar un viaje.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('No te postulaste a ninguna carga todavía.'),
    ).toBeInTheDocument();
  });
});
