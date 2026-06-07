import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegisterPage from './page';
import { loadsApi } from '@/lib/api';
import type { RegisterItem } from '@/types/register';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/register',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Isolate from DashboardLayout's Sidebar data fetching.
jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

// Auth: admin so the participant filter + admin copy render.
jest.mock('@/store/auth', () => ({
  useAuthStore: (sel?: (s: any) => any) => {
    const state = { user: { id: 'me', role: 'ADMIN' } };
    return sel ? sel(state) : state;
  },
}));

jest.mock('@/lib/api', () => ({
  loadsApi: {
    getRegister: jest.fn(),
    exportRegister: jest.fn(),
  },
  // RegisterRow (rendered by RegisterList) reaches for messagesApi.
  messagesApi: {
    getTripMessages: jest.fn().mockResolvedValue({ data: { messages: [], total: 0 } }),
  },
}));

const getRegister = loadsApi.getRegister as jest.Mock;
const exportRegister = loadsApi.exportRegister as jest.Mock;

function makeItem(id: string, title: string): RegisterItem {
  return {
    id,
    title,
    description: null,
    status: 'DELIVERED',
    cargoType: 'Metales',
    weight: 1000,
    volume: null,
    price: 1000,
    originAddress: 'Origen',
    originLat: 0,
    originLng: 0,
    destAddress: 'Destino',
    destLat: 0,
    destLng: 0,
    pickupDate: '2026-01-10T08:00:00.000Z',
    deliveryDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    shipper: {
      id: 's1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      companyName: null,
      email: 'a@b.com',
      phone: null,
    },
    trip: null,
  } as RegisterItem;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RegisterPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getRegister.mockResolvedValue({
    data: {
      items: [makeItem('1', 'Carga uno'), makeItem('2', 'Carga dos')],
      total: 2,
      page: 1,
      totalPages: 1,
    },
  });
  exportRegister.mockResolvedValue({ data: new Blob(['x']) });
});

describe('RegisterPage', () => {
  it('renders the admin header copy and the registry rows', async () => {
    renderPage();
    expect(screen.getByText('Vista de administrador')).toBeInTheDocument();
    expect(await screen.findByText('Carga uno')).toBeInTheDocument();
    expect(screen.getByText('Carga dos')).toBeInTheDocument();
    await waitFor(() => expect(getRegister).toHaveBeenCalled());
  });

  it('shows the total count from the response', async () => {
    renderPage();
    expect(await screen.findByText('2 cargas')).toBeInTheDocument();
  });

  it('triggers the export when the export button is clicked', async () => {
    // Stub DOM APIs used by exportRegister's blob download.
    const createObjectURL = jest.fn(() => 'blob:url');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Carga uno');

    const exportBtn = screen.getByRole('button', { name: /Exportar CSV/i });
    await user.click(exportBtn);

    await waitFor(() => expect(exportRegister).toHaveBeenCalledTimes(1));
  });
});
