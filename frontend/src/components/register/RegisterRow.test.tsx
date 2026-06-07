import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegisterRow from './RegisterRow';
import type { RegisterItem } from '@/types/register';

// MessageThread (rendered when expanded) pulls from the auth store + react-query.
// Mock the store so the child renders without a real session.
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

function renderRow(item: RegisterItem) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RegisterRow item={item} />
    </QueryClientProvider>,
  );
}

const baseItem: RegisterItem = {
  id: 'load-1',
  title: 'Acero a Rosario',
  description: 'Bobinas de acero',
  status: 'DELIVERED',
  cargoType: 'Metales',
  weight: 12000,
  volume: 30,
  price: 250000,
  originAddress: 'Buenos Aires',
  originLat: -34.6,
  originLng: -58.4,
  destAddress: 'Rosario',
  destLat: -32.9,
  destLng: -60.7,
  pickupDate: '2026-01-10T08:00:00.000Z',
  deliveryDate: '2026-01-12T18:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-12T18:00:00.000Z',
  shipper: {
    id: 'shipper-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    companyName: 'AceroCorp',
    email: 'ada@acero.com',
    phone: '111',
  },
  trip: {
    id: 'trip-1',
    status: 'COMPLETED',
    startedAt: '2026-01-10T09:00:00.000Z',
    completedAt: '2026-01-12T17:00:00.000Z',
    notes: 'Sin novedades',
    carrier: {
      id: 'carrier-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      companyName: 'TransHopper',
      email: 'grace@trans.com',
      phone: '222',
    },
    messageCount: 7,
    lastMessagePreview: null,
  },
};

describe('RegisterRow', () => {
  it('renders title, status badge and price', () => {
    renderRow(baseItem);
    expect(screen.getByText('Acero a Rosario')).toBeInTheDocument();
    // StatusBadge label for DELIVERED is "Entregado".
    expect(screen.getByText('Entregado')).toBeInTheDocument();
    // formatCurrency renders the price with $ and grouped thousands.
    expect(screen.getByText(/\$/)).toBeInTheDocument();
    expect(screen.getByText(/250\.000/)).toBeInTheDocument();
  });

  it('renders origin and destination addresses', () => {
    renderRow(baseItem);
    expect(screen.getAllByText('Buenos Aires').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rosario').length).toBeGreaterThan(0);
  });

  it('renders shipper and carrier participant labels (name · company)', () => {
    renderRow(baseItem);
    expect(screen.getByText('Ada Lovelace · AceroCorp')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper · TransHopper')).toBeInTheDocument();
  });

  it('renders the message count from the trip', () => {
    renderRow(baseItem);
    // The collapsed header shows the trip messageCount (7).
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows a placeholder for the carrier when trip is null', () => {
    const noTrip: RegisterItem = { ...baseItem, trip: null };
    renderRow(noTrip);
    // participantLabel(undefined) -> "—" for the carrier in the collapsed header.
    expect(screen.getByText('—')).toBeInTheDocument();
    // Message count falls back to 0.
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('expands to reveal detail sections and the trip-null carrier message', async () => {
    const user = userEvent.setup();
    const noTrip: RegisterItem = { ...baseItem, trip: null };
    renderRow(noTrip);

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('Carga')).toBeInTheDocument();
    expect(screen.getByText('Transportista')).toBeInTheDocument();
    expect(
      screen.getByText('Esta carga no fue tomada por ningún transportista.'),
    ).toBeInTheDocument();
    // MessageThread with null tripId renders the "no conversation" placeholder.
    expect(
      screen.getByText('Esta carga no generó conversación.'),
    ).toBeInTheDocument();
  });

  it('expands to show carrier detail when a trip exists', async () => {
    const user = userEvent.setup();
    renderRow(baseItem);

    await user.click(screen.getByRole('button'));

    const carrierSection = screen.getByText('Transportista').closest('section') as HTMLElement;
    expect(within(carrierSection).getByText('grace@trans.com')).toBeInTheDocument();
    expect(within(carrierSection).getByText('Sin novedades')).toBeInTheDocument();
  });
});
