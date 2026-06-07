import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoadDetailPage from './page';

jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Heavy / Leaflet children — stub out.
jest.mock('@/components/maps/MapView', () => ({
  __esModule: true,
  default: () => <div data-testid="map-view" />,
}));
jest.mock('@/components/postulations/PostulationsPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="postulations-panel" />,
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'l1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/loads/l1',
}));

jest.mock('@/lib/api', () => ({
  loadsApi: { getById: jest.fn(), cancel: jest.fn() },
  postulationsApi: {
    getMy: jest.fn(),
    create: jest.fn(),
    withdraw: jest.fn(),
    acceptOffer: jest.fn(),
    counterOffer: jest.fn(),
  },
}));

// useRoute fetches an OSRM route — neutralize it.
jest.mock('@/lib/useRoute', () => ({ useRoute: () => [] }));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadsApi, postulationsApi } = require('@/lib/api') as {
  loadsApi: Record<string, jest.Mock>;
  postulationsApi: Record<string, jest.Mock>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useAuthStore } = require('@/store/auth') as { useAuthStore: jest.Mock };

function mockUser(user: Record<string, unknown> | null) {
  const state = { user };
  useAuthStore.mockImplementation((sel?: (s: unknown) => unknown) =>
    sel ? sel(state) : state,
  );
}

function makeLoad(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    title: 'Electrónica a Córdoba',
    description: 'Frágil',
    cargoType: 'Electrónica y tecnología',
    weight: 100,
    volume: 2,
    price: 5000,
    status: 'PUBLISHED',
    shipperId: 'shipper-1',
    originAddress: 'Buenos Aires',
    destAddress: 'Córdoba',
    originLat: -34.6,
    originLng: -58.38,
    destLat: -31.42,
    destLng: -64.18,
    pickupDate: '2026-02-01T00:00:00.000Z',
    deliveryDate: '2026-02-05T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    shipper: { firstName: 'Sam', lastName: 'Shipper', companyName: 'ACME' },
    trip: null,
    pendingPostulationsCount: 0,
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LoadDetailPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  postulationsApi.getMy.mockResolvedValue({ data: [] });
});

describe('LoadDetailPage — fetch + render', () => {
  it('fetches the load by param id and renders it', async () => {
    mockUser({ id: 'shipper-1', role: 'CARGO_GENERATOR' });
    loadsApi.getById.mockResolvedValue({ data: makeLoad() });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Electrónica a Córdoba' })).toBeInTheDocument();
    expect(loadsApi.getById).toHaveBeenCalledWith('l1');
    expect(screen.getByText('Sam Shipper')).toBeInTheDocument();
    expect(screen.getByTestId('map-view')).toBeInTheDocument();
  });

  it('renders a not-found message when the load is missing', async () => {
    mockUser({ id: 'u1', role: 'ADMIN' });
    loadsApi.getById.mockResolvedValue({ data: null });

    renderPage();

    expect(await screen.findByText('Carga no encontrada')).toBeInTheDocument();
  });
});

describe('LoadDetailPage — owner actions', () => {
  it('shows Edit + Cancel for the owning shipper and cancels via loadsApi.cancel', async () => {
    mockUser({ id: 'shipper-1', role: 'CARGO_GENERATOR' });
    loadsApi.getById.mockResolvedValue({ data: makeLoad() });
    loadsApi.cancel.mockResolvedValue({ data: {} });

    renderPage();

    expect(await screen.findByRole('link', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByTestId('postulations-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Postularme' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancelar Carga' }));
    await waitFor(() => expect(loadsApi.cancel).toHaveBeenCalledWith('l1'));
  });

  it('hides owner actions for a non-owning shipper', async () => {
    mockUser({ id: 'other-shipper', role: 'CARGO_GENERATOR' });
    loadsApi.getById.mockResolvedValue({ data: makeLoad() });

    renderPage();

    await screen.findByRole('heading', { name: 'Electrónica a Córdoba' });
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar Carga' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('postulations-panel')).not.toBeInTheDocument();
  });
});

describe('LoadDetailPage — transporter actions', () => {
  it('shows Postularme and creates a postulation', async () => {
    mockUser({ id: 't1', role: 'TRANSPORTER' });
    loadsApi.getById.mockResolvedValue({ data: makeLoad() });
    postulationsApi.getMy.mockResolvedValue({ data: [] });
    postulationsApi.create.mockResolvedValue({ data: {} });

    renderPage();

    const postulateBtn = await screen.findByRole('button', { name: 'Postularme' });
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(postulateBtn);

    // PostulateModal opens; submit with the default (no proposed price).
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: /Enviar/ });
    await user.click(submit);

    await waitFor(() => expect(postulationsApi.create).toHaveBeenCalledWith('l1', expect.anything()));
  });

  it('hides Postularme when the transporter already has an active postulation', async () => {
    mockUser({ id: 't1', role: 'TRANSPORTER' });
    loadsApi.getById.mockResolvedValue({ data: makeLoad() });
    postulationsApi.getMy.mockResolvedValue({
      data: [{ id: 'p1', loadId: 'l1', status: 'PENDING', proposedPrice: 4800 }],
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Electrónica a Córdoba' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Postularme' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Tu postulación:')).toBeInTheDocument();
  });
});
