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
    cargoType: 'Electrónica',
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

  it('refuses to edit a non-PUBLISHED load', async () => {
    loadsApi.getById.mockResolvedValue({ data: makeLoad({ status: 'ASSIGNED' }) });

    renderPage();

    expect(
      await screen.findByText('Solo se pueden editar cargas con estado PUBLISHED.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
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
