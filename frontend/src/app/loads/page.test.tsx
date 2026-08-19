import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoadsPage from './page';

// DashboardLayout wraps every page and redirects unauthenticated users; render
// it as a transparent passthrough so the test focuses on the page body.
jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/lib/api', () => ({
  loadsApi: {
    getAll: jest.fn(),
    getAvailable: jest.fn(),
    getMy: jest.fn(),
  },
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
    originAddress: 'Buenos Aires',
    destAddress: 'Córdoba',
    createdAt: '2026-01-01T00:00:00.000Z',
    pickupDate: '2026-02-01T00:00:00.000Z',
    deliveryDate: '2026-02-05T00:00:00.000Z',
    status: 'PUBLISHED',
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LoadsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoadsPage — data fetching by role', () => {
  it('calls getMy for a CARGO_GENERATOR and renders the loads', async () => {
    mockUser({ id: 'u1', role: 'CARGO_GENERATOR' });
    loadsApi.getMy.mockResolvedValue({ data: { loads: [makeLoad()], total: 1, page: 1, totalPages: 1 } });

    renderPage();

    expect(await screen.findByText('Electrónica a Córdoba')).toBeInTheDocument();
    expect(loadsApi.getMy).toHaveBeenCalled();
    expect(loadsApi.getAvailable).not.toHaveBeenCalled();
    expect(loadsApi.getAll).not.toHaveBeenCalled();
    // Owner-only "Nueva carga" CTA.
    expect(screen.getByRole('link', { name: /Nueva carga/ })).toBeInTheDocument();
  });

  it('keeps the creation column for a CARGO_GENERATOR', async () => {
    mockUser({ id: 'u1', role: 'CARGO_GENERATOR' });
    loadsApi.getMy.mockResolvedValue({ data: { loads: [makeLoad({ title: 'Mi carga' })], total: 1, page: 1, totalPages: 1 } });

    renderPage();

    expect(await screen.findByText('Mi carga')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Creación' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument();
  });

  it('calls getAvailable for a TRANSPORTER and hides the status filter + CTA', async () => {
    mockUser({ id: 'u2', role: 'TRANSPORTER' });
    loadsApi.getAvailable.mockResolvedValue({ data: { loads: [makeLoad({ title: 'Carga libre' })], total: 1, page: 1, totalPages: 1 } });

    renderPage();

    expect(await screen.findByText('Carga libre')).toBeInTheDocument();
    expect(loadsApi.getAvailable).toHaveBeenCalled();
    expect(loadsApi.getMy).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Nueva carga/ })).not.toBeInTheDocument();
    // Status filter is hidden for transporters.
    expect(screen.queryByRole('combobox', { name: 'Estado' })).not.toBeInTheDocument();
    // Ni la fecha de publicación ni el estado: no le aportan para decidir.
    expect(screen.queryByRole('columnheader', { name: 'Creación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Estado' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Recogida' })).toBeInTheDocument();
  });

  it('calls getAll for an ADMIN', async () => {
    mockUser({ id: 'u3', role: 'ADMIN' });
    loadsApi.getAll.mockResolvedValue({ data: { loads: [makeLoad()], total: 1, page: 1, totalPages: 1 } });

    renderPage();

    await waitFor(() => expect(loadsApi.getAll).toHaveBeenCalled());
  });
});

describe('LoadsPage — filters', () => {
  it('shows an empty state when no loads match', async () => {
    mockUser({ id: 'u1', role: 'CARGO_GENERATOR' });
    loadsApi.getMy.mockResolvedValue({ data: { loads: [], total: 0, page: 1, totalPages: 0 } });

    renderPage();

    expect(await screen.findByText('Sin cargas con esos filtros')).toBeInTheDocument();
  });

  it('passes the cargoType filter into the query params', async () => {
    mockUser({ id: 'u1', role: 'CARGO_GENERATOR' });
    loadsApi.getMy.mockResolvedValue({ data: { loads: [makeLoad()], total: 1, page: 1, totalPages: 1 } });

    renderPage();
    await screen.findByText('Electrónica a Córdoba');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo de carga' }), 'Alimentos y bebidas');

    await waitFor(() =>
      expect(loadsApi.getMy).toHaveBeenCalledWith(
        expect.objectContaining({ cargoType: 'Alimentos y bebidas' }),
      ),
    );
  });

  it('debounces the search input into the query params', async () => {
    jest.useFakeTimers();
    mockUser({ id: 'u1', role: 'CARGO_GENERATOR' });
    loadsApi.getMy.mockResolvedValue({ data: { loads: [makeLoad()], total: 1, page: 1, totalPages: 1 } });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderPage();

    await user.type(screen.getByPlaceholderText(/Buscar por título/), 'cordoba');
    jest.advanceTimersByTime(450);

    await waitFor(() =>
      expect(loadsApi.getMy).toHaveBeenCalledWith(expect.objectContaining({ q: 'cordoba' })),
    );
    jest.useRealTimers();
  });
});
