import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrackingDetailPage from './page';

jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/maps/MapView', () => ({
  __esModule: true,
  default: () => <div data-testid="map" />,
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 't1' }),
}));

jest.mock('@/lib/useRoute', () => ({
  useRoute: () => [],
}));

const getById = jest.fn();
jest.mock('@/lib/api', () => ({
  tripsApi: { getById: (...a: any[]) => getById(...a) },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TrackingDetailPage />
    </QueryClientProvider>,
  );
}

const trip = {
  id: 't1',
  status: 'IN_PROGRESS',
  currentLat: -34.6037,
  currentLng: -58.3816,
  carrier: { firstName: 'Ada', lastName: 'Lovelace' },
  load: {
    title: 'Granos a Rosario',
    originLat: -34.6, originLng: -58.4, originAddress: 'Buenos Aires',
    destLat: -32.9, destLng: -60.6, destAddress: 'Rosario',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TrackingDetailPage', () => {
  it('shows a loading spinner while fetching', () => {
    getById.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('fetches the trip by the id param', async () => {
    getById.mockResolvedValue({ data: trip });
    renderPage();
    await waitFor(() => expect(getById).toHaveBeenCalledWith('t1'));
  });

  it('renders the map and trip detail (origin, destination, last position)', async () => {
    getById.mockResolvedValue({ data: trip });
    renderPage();

    expect(await screen.findByText('Granos a Rosario')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toBeInTheDocument();
    expect(screen.getByText('Buenos Aires')).toBeInTheDocument();
    expect(screen.getByText('Rosario')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    // Last position rounded to 4 decimals.
    expect(screen.getByText('-34.6037, -58.3816')).toBeInTheDocument();
  });

  it('links back to the full trip detail page', async () => {
    getById.mockResolvedValue({ data: trip });
    renderPage();
    const link = await screen.findByText('Ver detalles completos');
    expect(link.closest('a')).toHaveAttribute('href', '/trips/t1');
  });

  it('shows the not-found state when the trip is missing', async () => {
    getById.mockResolvedValue({ data: null });
    renderPage();
    expect(await screen.findByText('Viaje no encontrado')).toBeInTheDocument();
  });

  it('shows a no-location placeholder when there are no coords', async () => {
    getById.mockResolvedValue({
      data: { ...trip, currentLat: null, currentLng: null },
    });
    renderPage();
    expect(
      await screen.findByText('Sin datos de ubicación aún'),
    ).toBeInTheDocument();
  });
});
