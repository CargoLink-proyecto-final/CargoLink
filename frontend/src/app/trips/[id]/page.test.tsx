import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripDetailPage from './page';

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

let authState: any = { user: { id: 'me', role: 'TRANSPORTER' } };
jest.mock('@/store/auth', () => ({
  useAuthStore: (sel?: (s: any) => any) => (sel ? sel(authState) : authState),
}));

const api = {
  getById: jest.fn(),
  start: jest.fn(),
  complete: jest.fn(),
  create: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  tripsApi: {
    getById: (...a: any[]) => api.getById(...a),
    start: (...a: any[]) => api.start(...a),
    complete: (...a: any[]) => api.complete(...a),
  },
  ratingsApi: {
    create: (...a: any[]) => api.create(...a),
  },
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TripDetailPage />
    </QueryClientProvider>,
  );
}

const baseTrip = {
  id: 't1',
  status: 'ACCEPTED',
  carrierId: 'me',
  createdAt: '2026-01-01T00:00:00.000Z',
  currentLat: null,
  currentLng: null,
  carrier: { firstName: 'Ada', lastName: 'Lovelace', companyName: 'Lovelace Log' },
  load: {
    title: 'Granos a Rosario',
    originLat: -34.6, originLng: -58.4, originAddress: 'Buenos Aires',
    destLat: -32.9, destLng: -60.6, destAddress: 'Rosario',
    cargoType: 'Granos', weight: 1000, price: 50000,
  },
  ratings: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  authState = { user: { id: 'me', role: 'TRANSPORTER' } };
  api.start.mockResolvedValue({ data: {} });
  api.complete.mockResolvedValue({ data: {} });
  api.create.mockResolvedValue({ data: {} });
});

describe('TripDetailPage', () => {
  it('shows a loading spinner while fetching', () => {
    api.getById.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('fetches the trip by id and renders detail (route, cargo, carrier)', async () => {
    api.getById.mockResolvedValue({ data: baseTrip });
    renderPage();

    expect(await screen.findByText('Granos a Rosario')).toBeInTheDocument();
    expect(api.getById).toHaveBeenCalledWith('t1');
    expect(screen.getByText('Buenos Aires')).toBeInTheDocument();
    expect(screen.getByText('Rosario')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Granos')).toBeInTheDocument();
  });

  it('shows the not-found state when the trip is missing', async () => {
    api.getById.mockResolvedValue({ data: null });
    renderPage();
    expect(await screen.findByText('Viaje no encontrado')).toBeInTheDocument();
  });

  it('starts the trip for the carrier on an ACCEPTED trip', async () => {
    const user = userEvent.setup();
    api.getById.mockResolvedValue({ data: baseTrip });
    renderPage();

    const btn = await screen.findByRole('button', {
      name: 'Marcar como recogida e iniciar',
    });
    await user.click(btn);
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('t1'));
  });

  it('completes an IN_PROGRESS trip with fuel liters from the modal', async () => {
    const user = userEvent.setup();
    api.getById.mockResolvedValue({ data: { ...baseTrip, status: 'IN_PROGRESS' } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Completar Viaje' }));
    // Modal opens (its title is "Completar viaje"). Fill liters and submit.
    await user.type(await screen.findByPlaceholderText('Ej. 85.5'), '80');
    // Both the page trigger and the modal submit are named "Completar Viaje";
    // the modal submit is the last one rendered (via portal to document.body).
    const completeButtons = screen.getAllByRole('button', { name: 'Completar Viaje' });
    await user.click(completeButtons[completeButtons.length - 1]);

    await waitFor(() =>
      expect(api.complete).toHaveBeenCalledWith('t1', { fuelLiters: 80 }),
    );
  });

  it('shows the rating entry on a completed trip and submits a rating', async () => {
    const user = userEvent.setup();
    api.getById.mockResolvedValue({ data: { ...baseTrip, status: 'COMPLETED' } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Calificar Viaje/ }));
    await user.click(screen.getByRole('button', { name: 'Enviar Calificación' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        tripId: 't1',
        score: 5,
        comment: '',
      }),
    );
  });

  it('hides the rating entry when the user already rated', async () => {
    api.getById.mockResolvedValue({
      data: {
        ...baseTrip,
        status: 'COMPLETED',
        ratings: [{ id: 'r1', fromUserId: 'me', score: 5 }],
      },
    });
    renderPage();
    await screen.findByText('Granos a Rosario');
    expect(
      screen.queryByRole('button', { name: /Calificar Viaje/ }),
    ).not.toBeInTheDocument();
  });

  it('does not show start/complete actions for a non-carrier viewer', async () => {
    authState = { user: { id: 'someone-else', role: 'TRANSPORTER' } };
    api.getById.mockResolvedValue({ data: { ...baseTrip, status: 'IN_PROGRESS' } });
    renderPage();
    await screen.findByText('Granos a Rosario');
    expect(
      screen.queryByRole('button', { name: 'Completar Viaje' }),
    ).not.toBeInTheDocument();
  });
});
