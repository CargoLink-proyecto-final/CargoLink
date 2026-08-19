import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import MyPostulationsPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/postulations',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  postulationsApi: { getMy: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { postulationsApi } = require('@/lib/api') as {
  postulationsApi: Record<string, jest.Mock>;
};

const TRANSPORTER = {
  id: 'u1',
  email: 'carrier@example.com',
  firstName: 'Carlos',
  lastName: 'Martínez',
  role: 'TRANSPORTER',
};

function mockAuth(state: Record<string, unknown>) {
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel?: (s: unknown) => unknown) =>
    sel ? sel(state) : state,
  );
}

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MyPostulationsPage />
    </QueryClientProvider>,
  );
}

function postulation(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    loadId: 'l1',
    status: 'PENDING',
    proposedPrice: 900,
    counterOfferPrice: null,
    lastOfferBy: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    load: {
      id: 'l1',
      title: 'Carga de prueba',
      originAddress: 'Salta',
      destAddress: 'Jujuy',
      trip: null,
    },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth({ isAuthenticated: true, user: TRANSPORTER });
});

describe('MyPostulationsPage', () => {
  it('lists my postulations with route and proposed price', async () => {
    postulationsApi.getMy.mockResolvedValue({ data: [postulation()] });
    renderWithClient();

    expect(await screen.findByText('Carga de prueba')).toBeInTheDocument();
    expect(screen.getByText(/Salta/)).toBeInTheDocument();
    expect(screen.getByText(/Propusiste/)).toBeInTheDocument();
  });

  it('calls out the ones awaiting the carrier reply', async () => {
    postulationsApi.getMy.mockResolvedValue({
      data: [
        postulation({
          id: 'p1',
          status: 'NEGOTIATING',
          lastOfferBy: 'SHIPPER',
          counterOfferPrice: 800,
        }),
        postulation({ id: 'p2', loadId: 'l2' }),
      ],
    });
    renderWithClient();

    expect(await screen.findByText(/1 contraoferta/)).toBeInTheDocument();
    expect(screen.getByText('Esperando tu respuesta')).toBeInTheDocument();
  });

  it('does not nag when nothing awaits a reply', async () => {
    postulationsApi.getMy.mockResolvedValue({ data: [postulation()] });
    renderWithClient();

    await screen.findByText('Carga de prueba');
    expect(screen.queryByText(/esperando tu respuesta/i)).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    postulationsApi.getMy.mockResolvedValue({
      data: [
        postulation({ id: 'p1', status: 'PENDING' }),
        postulation({
          id: 'p2',
          loadId: 'l2',
          status: 'NEGOTIATING',
          lastOfferBy: 'SHIPPER',
          load: { ...postulation().load, id: 'l2', title: 'Carga en negociación' },
        }),
      ],
    });
    renderWithClient();

    await screen.findByText('Carga en negociación');
    fireEvent.click(screen.getByRole('button', { name: /NEGOCIA/i }));

    expect(screen.getByText('Carga en negociación')).toBeInTheDocument();
    expect(screen.queryByText('Carga de prueba')).not.toBeInTheDocument();
  });

  it('leaves resolved postulations out of the list', async () => {
    // Aceptar una postulación crea el Trip en la misma transacción del backend,
    // así que una ACCEPTED ya es un viaje y duplicaría "Mis Viajes".
    postulationsApi.getMy.mockResolvedValue({
      data: [
        postulation({ id: 'p1', status: 'PENDING' }),
        postulation({
          id: 'p2',
          loadId: 'l2',
          status: 'ACCEPTED',
          load: { ...postulation().load, id: 'l2', title: 'Carga aceptada', trip: { id: 't9' } },
        }),
        postulation({
          id: 'p3',
          loadId: 'l3',
          status: 'REJECTED',
          load: { ...postulation().load, id: 'l3', title: 'Carga rechazada' },
        }),
        postulation({
          id: 'p4',
          loadId: 'l4',
          status: 'WITHDRAWN',
          load: { ...postulation().load, id: 'l4', title: 'Carga retirada' },
        }),
      ],
    });
    renderWithClient();

    expect(await screen.findByText('Carga de prueba')).toBeInTheDocument();
    expect(screen.queryByText('Carga aceptada')).not.toBeInTheDocument();
    expect(screen.queryByText('Carga rechazada')).not.toBeInTheDocument();
    expect(screen.queryByText('Carga retirada')).not.toBeInTheDocument();
    // El contador del chip "Todas" también ignora las resueltas.
    expect(screen.getByRole('button', { name: 'Todas (1)' })).toBeInTheDocument();
  });

  it('links a row to its load so the carrier can respond there', async () => {
    postulationsApi.getMy.mockResolvedValue({ data: [postulation({ loadId: 'l7' })] });
    renderWithClient();

    const row = (await screen.findByText('Carga de prueba')).closest('a');
    expect(row).toHaveAttribute('href', '/loads/l7');
  });

  it('shows an empty state when nothing is awaiting a response', async () => {
    postulationsApi.getMy.mockResolvedValue({
      data: [postulation({ status: 'ACCEPTED' })],
    });
    renderWithClient();

    expect(
      await screen.findByText('No tenés postulaciones esperando respuesta.'),
    ).toBeInTheDocument();
  });
});
