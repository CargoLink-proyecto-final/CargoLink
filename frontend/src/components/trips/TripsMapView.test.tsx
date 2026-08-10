import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripsMapView from './TripsMapView';

jest.mock('@/components/maps/MapView', () => ({
  __esModule: true,
  default: () => <div data-testid="map" />,
}));

jest.mock('@/lib/routing', () => ({
  fetchRoute: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/store/auth', () => ({
  useAuthStore: (sel?: (s: any) => any) => {
    const state = { user: { id: 'me', role: 'TRANSPORTER' } };
    return sel ? sel(state) : state;
  },
}));

const api = { getMy: jest.fn(), getMyLoads: jest.fn(), getAll: jest.fn() };
jest.mock('@/lib/api', () => ({
  tripsApi: {
    getMy: (...a: any[]) => api.getMy(...a),
    getMyLoads: (...a: any[]) => api.getMyLoads(...a),
    getAll: (...a: any[]) => api.getAll(...a),
  },
}));

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TripsMapView />
    </QueryClientProvider>,
  );
}

const trips = [
  {
    id: 'trip-1',
    status: 'IN_PROGRESS',
    currentLat: -34.6,
    currentLng: -58.4,
    carrier: { firstName: 'Ada', lastName: 'Lovelace' },
    load: {
      title: 'Granos a Rosario',
      originLat: -34.6, originLng: -58.4, originAddress: 'Buenos Aires',
      destLat: -32.9, destLng: -60.6, destAddress: 'Rosario',
    },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TripsMapView', () => {
  it('queries trips by role (TRANSPORTER -> getMy with IN_PROGRESS filter)', async () => {
    api.getMy.mockResolvedValue({ data: { trips } });
    renderView();
    await waitFor(() =>
      expect(api.getMy).toHaveBeenCalledWith({ status: 'IN_PROGRESS' }),
    );
    expect(api.getMyLoads).not.toHaveBeenCalled();
    expect(api.getAll).not.toHaveBeenCalled();
  });

  it('renders the map and lists in-progress trips with the active count', async () => {
    api.getMy.mockResolvedValue({ data: { trips } });
    renderView();

    expect(await screen.findByText('Granos a Rosario')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Viajes en curso (1)')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('links each trip to its full trip detail page', async () => {
    api.getMy.mockResolvedValue({ data: { trips } });
    renderView();
    const link = (await screen.findByText('Granos a Rosario')).closest('a');
    expect(link).toHaveAttribute('href', '/trips/trip-1');
  });

  it('shows the empty state when there are no in-progress trips', async () => {
    api.getMy.mockResolvedValue({ data: { trips: [] } });
    renderView();
    expect(
      await screen.findByText('Sin viajes en curso ahora mismo.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Viajes en curso (0)')).toBeInTheDocument();
  });
});
