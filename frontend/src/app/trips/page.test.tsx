import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripsPage from './page';

jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/trips/TripsMapView', () => ({
  __esModule: true,
  default: () => <div data-testid="trips-map-view" />,
}));

jest.mock('@/store/auth', () => ({
  useAuthStore: (sel?: (s: any) => any) => {
    const state = { user: { id: 'me', role: 'TRANSPORTER' } };
    return sel ? sel(state) : state;
  },
}));

const api = { getMy: jest.fn(), getMyLoads: jest.fn() };
jest.mock('@/lib/api', () => ({
  tripsApi: {
    getMy: (...a: any[]) => api.getMy(...a),
    getMyLoads: (...a: any[]) => api.getMyLoads(...a),
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TripsPage />
    </QueryClientProvider>,
  );
}

const trips = [
  {
    id: 'trip-1',
    status: 'COMPLETED',
    createdAt: '2026-01-01T00:00:00.000Z',
    load: { title: 'Granos a Rosario' },
    carrier: { firstName: 'Ada', lastName: 'Lovelace' },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.getMy.mockResolvedValue({ data: { trips, totalPages: 1, page: 1, total: 1 } });
});

describe('TripsPage', () => {
  it('renders the list view by default with the trips table', async () => {
    renderPage();
    expect(await screen.findByText('Granos a Rosario')).toBeInTheDocument();
    expect(screen.queryByTestId('trips-map-view')).not.toBeInTheDocument();
  });

  it('switches to the map view when the "Mapa" tab is clicked', async () => {
    renderPage();
    await screen.findByText('Granos a Rosario');

    await userEvent.click(screen.getByRole('button', { name: /mapa/i }));

    expect(screen.getByTestId('trips-map-view')).toBeInTheDocument();
    expect(screen.queryByText('Granos a Rosario')).not.toBeInTheDocument();
  });

  it('switches back to the list view from the map view', async () => {
    renderPage();
    await screen.findByText('Granos a Rosario');

    await userEvent.click(screen.getByRole('button', { name: /mapa/i }));
    await userEvent.click(screen.getByRole('button', { name: /lista/i }));

    expect(await screen.findByText('Granos a Rosario')).toBeInTheDocument();
    expect(screen.queryByTestId('trips-map-view')).not.toBeInTheDocument();
  });

  it('hides the status filter while in map view', async () => {
    renderPage();
    await screen.findByText('Granos a Rosario');
    expect(screen.getByText('Todos los estados')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /mapa/i }));

    expect(screen.queryByText('Todos los estados')).not.toBeInTheDocument();
  });
});
