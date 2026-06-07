import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PostulationsPanel from './PostulationsPanel';
import type { PostulationWithTransporter } from '@/types';

jest.mock('@/lib/api', () => ({
  postulationsApi: {
    create: jest.fn(),
    getForLoad: jest.fn(),
    getMy: jest.fn(),
    accept: jest.fn(),
    counterOffer: jest.fn(),
    acceptOffer: jest.fn(),
    withdraw: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { postulationsApi } = require('@/lib/api') as {
  postulationsApi: Record<string, jest.Mock>;
};

const transporter = {
  id: 't-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+5491100000000',
  companyName: 'Lovelace Logística',
  avatarUrl: null,
};

function makePostulation(
  overrides: Partial<PostulationWithTransporter> = {},
): PostulationWithTransporter {
  return {
    id: 'p-1',
    loadId: 'load-1',
    transporterId: 't-1',
    message: null,
    proposedPrice: 1200,
    counterOfferPrice: null,
    lastOfferBy: null,
    status: 'PENDING',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    transporter,
    averageRating: 0,
    totalRatings: 0,
    ...overrides,
  };
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof PostulationsPanel>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PostulationsPanel
        loadId={props.loadId ?? 'load-1'}
        listedPrice={props.listedPrice ?? 1000}
        canAccept={props.canAccept ?? true}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PostulationsPanel — listing', () => {
  it('shows a loading state while fetching', () => {
    postulationsApi.getForLoad.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText('Cargando postulaciones...')).toBeInTheDocument();
  });

  it('shows an empty state when there are no postulations', async () => {
    postulationsApi.getForLoad.mockResolvedValue({ data: [] });
    renderPanel();
    expect(
      await screen.findByText('Todavía no hay postulaciones para esta carga.'),
    ).toBeInTheDocument();
  });

  it('renders one card per postulation and the count', async () => {
    postulationsApi.getForLoad.mockResolvedValue({
      data: [
        makePostulation({ id: 'p-1' }),
        makePostulation({
          id: 'p-2',
          transporter: { ...transporter, id: 't-2', firstName: 'Grace', lastName: 'Hopper' },
        }),
      ],
    });
    renderPanel();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('calls getForLoad with the loadId', async () => {
    postulationsApi.getForLoad.mockResolvedValue({ data: [] });
    renderPanel({ loadId: 'load-xyz' });
    await waitFor(() => expect(postulationsApi.getForLoad).toHaveBeenCalledWith('load-xyz'));
  });
});

describe('PostulationsPanel — accept action', () => {
  it('calls postulationsApi.accept with the postulation id', async () => {
    const user = userEvent.setup();
    postulationsApi.getForLoad.mockResolvedValue({
      data: [makePostulation({ id: 'p-1', status: 'PENDING' })],
    });
    postulationsApi.accept.mockResolvedValue({ data: {} });

    renderPanel();
    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'Elegir transportista' }));

    await waitFor(() => expect(postulationsApi.accept).toHaveBeenCalledWith('p-1'));
  });
});

describe('PostulationsPanel — counter-offer action', () => {
  it('calls postulationsApi.counterOffer with the id and price', async () => {
    const user = userEvent.setup();
    postulationsApi.getForLoad.mockResolvedValue({
      data: [makePostulation({ id: 'p-1', status: 'PENDING', proposedPrice: 1200 })],
    });
    postulationsApi.counterOffer.mockResolvedValue({ data: {} });

    renderPanel();
    await screen.findByText('Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'Contra-ofertar' }));
    await user.type(screen.getByPlaceholderText('Menos de $1200'), '1100');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() =>
      expect(postulationsApi.counterOffer).toHaveBeenCalledWith('p-1', 1100),
    );
  });
});

describe('PostulationsPanel — canAccept gating', () => {
  it('hides the action buttons when canAccept is false', async () => {
    postulationsApi.getForLoad.mockResolvedValue({
      data: [makePostulation({ id: 'p-1', status: 'PENDING', proposedPrice: 1200 })],
    });
    renderPanel({ canAccept: false });
    await screen.findByText('Ada Lovelace');
    expect(screen.queryByRole('button', { name: /Elegir transportista/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contra-ofertar' })).not.toBeInTheDocument();
  });

  it('treats accepted/rejected postulations as non-actionable even if canAccept is true', async () => {
    postulationsApi.getForLoad.mockResolvedValue({
      data: [makePostulation({ id: 'p-1', status: 'ACCEPTED', proposedPrice: 1200 })],
    });
    renderPanel({ canAccept: true });
    await screen.findByText('Ada Lovelace');
    expect(screen.queryByRole('button', { name: /Elegir transportista/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contra-ofertar' })).not.toBeInTheDocument();
  });
});
