import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegisterList from './RegisterList';
import type { RegisterItem } from '@/types/register';

// RegisterList renders RegisterRow children, which depend on the auth store + api.
jest.mock('@/store/auth', () => ({
  useAuthStore: (sel?: (s: any) => any) => {
    const state = { user: { id: 'me' } };
    return sel ? sel(state) : state;
  },
}));

jest.mock('@/lib/api', () => ({
  messagesApi: {
    getTripMessages: jest.fn().mockResolvedValue({ data: { messages: [], total: 0 } }),
  },
}));

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
    originAddress: 'A',
    originLat: 0,
    originLng: 0,
    destAddress: 'B',
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
  };
}

function renderList(props: React.ComponentProps<typeof RegisterList>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RegisterList {...props} />
    </QueryClientProvider>,
  );
}

describe('RegisterList', () => {
  it('renders a row per item', () => {
    renderList({
      items: [makeItem('1', 'Carga uno'), makeItem('2', 'Carga dos')],
      isLoading: false,
      isError: false,
    });
    expect(screen.getByText('Carga uno')).toBeInTheDocument();
    expect(screen.getByText('Carga dos')).toBeInTheDocument();
  });

  it('renders the loading state', () => {
    renderList({ items: [], isLoading: true, isError: false });
    expect(screen.getByText(/Cargando registro/)).toBeInTheDocument();
  });

  it('renders the empty state when there are no items', () => {
    renderList({ items: [], isLoading: false, isError: false });
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.getByText(/Ajustá los filtros/)).toBeInTheDocument();
  });

  it('renders a generic error message', () => {
    renderList({ items: [], isLoading: false, isError: true });
    expect(screen.getByText(/No se pudo cargar el registro/)).toBeInTheDocument();
  });

  it('appends the provided error message', () => {
    renderList({
      items: [],
      isLoading: false,
      isError: true,
      errorMessage: 'timeout',
    });
    expect(screen.getByText(/timeout/)).toBeInTheDocument();
  });
});
