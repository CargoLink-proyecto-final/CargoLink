import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EditLoadPage from './page';

jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'l1' }),
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/loads/l1/edit',
}));

jest.mock('@/lib/api', () => ({
  loadsApi: { getById: jest.fn(), update: jest.fn() },
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadsApi } = require('@/lib/api') as { loadsApi: Record<string, jest.Mock> };
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
    originAddress: 'Buenos Aires 100',
    originLat: -34.6,
    originLng: -58.38,
    destAddress: 'Córdoba 200',
    destLat: -31.42,
    destLng: -64.18,
    pickupDate: '2026-02-01T10:00:00.000Z',
    deliveryDate: '2026-02-05T10:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EditLoadPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser({ id: 'shipper-1', role: 'CARGO_GENERATOR' });
});

describe('EditLoadPage — prefill', () => {
  it('fetches the load by id and pre-fills the form', async () => {
    loadsApi.getById.mockResolvedValue({ data: makeLoad() });

    renderPage();

    expect(await screen.findByDisplayValue('Electrónica a Córdoba')).toBeInTheDocument();
    expect(loadsApi.getById).toHaveBeenCalledWith('l1');
    expect(screen.getByDisplayValue('Buenos Aires 100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Córdoba 200')).toBeInTheDocument();
  });

  it('refuses to edit a finalized/cancelled load', async () => {
    loadsApi.getById.mockResolvedValue({ data: makeLoad({ status: 'DELIVERED' }) });

    renderPage();

    expect(
      await screen.findByText('No se puede editar una carga finalizada o cancelada.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
  });

  it('locks critical fields when the load has an accepted postulation', async () => {
    loadsApi.getById.mockResolvedValue({ data: makeLoad({ status: 'ASSIGNED' }) });

    renderPage();

    // Title stays editable; the form is still shown with a lock notice.
    const titleInput = await screen.findByDisplayValue('Electrónica a Córdoba');
    expect(titleInput).not.toBeDisabled();
    expect(screen.getByText(/postulación aceptada/i)).toBeInTheDocument();
    // A critical field (weight) is disabled.
    expect(screen.getByDisplayValue('100')).toBeDisabled();
  });

  it('preserves an out-of-taxonomy cargoType instead of silently swapping it', async () => {
    // Loads created before the backend enforced the fixed category list (or
    // via a direct API call) can carry a cargoType outside the <select>'s
    // options. The form must show it as-is, not silently fall back to the
    // first option in the list.
    loadsApi.getById.mockResolvedValue({ data: makeLoad({ cargoType: 'BEBIDAS' }) });

    renderPage();

    expect(await screen.findByDisplayValue('BEBIDAS (categoría antigua)')).toBeInTheDocument();
    expect(
      screen.getByText(/Elegí una de la lista para poder guardar otros cambios/),
    ).toBeInTheDocument();
  });
});

describe('EditLoadPage — submit', () => {
  it('submits changes via loadsApi.update and redirects to the detail page', async () => {
    loadsApi.getById.mockResolvedValue({ data: makeLoad() });
    loadsApi.update.mockResolvedValue({ data: {} });

    renderPage();

    const titleInput = await screen.findByDisplayValue('Electrónica a Córdoba');
    const user = userEvent.setup();
    await user.clear(titleInput);
    await user.type(titleInput, 'Electrónica urgente');

    await user.click(screen.getByRole('button', { name: 'Guardar Cambios' }));

    await waitFor(() => expect(loadsApi.update).toHaveBeenCalledTimes(1));
    expect(loadsApi.update).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({
        title: 'Electrónica urgente',
        originLat: -34.6,
        destLat: -31.42,
        weight: 100,
        price: 5000,
      }),
    );
    expect(push).toHaveBeenCalledWith('/loads/l1');
  });
});
