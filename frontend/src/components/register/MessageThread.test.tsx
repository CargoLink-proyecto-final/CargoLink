import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MessageThread from './MessageThread';
import type { Message } from '@/types';

jest.mock('@/store/auth', () => ({
  useAuthStore: (sel?: (s: any) => any) => {
    const state = { user: { id: 'me' } };
    return sel ? sel(state) : state;
  },
}));

const getTripMessagesMock = jest.fn();
jest.mock('@/lib/api', () => ({
  messagesApi: {
    getTripMessages: (...args: any[]) => getTripMessagesMock(...args),
  },
}));

function renderThread(props: React.ComponentProps<typeof MessageThread>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MessageThread {...props} />
    </QueryClientProvider>,
  );
}

const messages: Message[] = [
  {
    id: 'm1',
    senderId: 'other',
    sender: { id: 'other', firstName: 'Grace', lastName: 'Hopper' },
    receiverId: 'me',
    content: 'Hola, cuándo retiran?',
    isRead: true,
    createdAt: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'm2',
    senderId: 'me',
    sender: { id: 'me', firstName: 'Ada', lastName: 'Lovelace' },
    receiverId: 'other',
    content: 'Mañana a las 8',
    isRead: false,
    createdAt: '2026-01-10T10:05:00.000Z',
  },
];

describe('MessageThread', () => {
  beforeEach(() => {
    getTripMessagesMock.mockReset();
    getTripMessagesMock.mockResolvedValue({ data: { messages, total: 2 } });
  });

  it('shows the "no conversation" placeholder when tripId is null', () => {
    renderThread({ tripId: null, messageCount: 0, enabled: true });
    expect(
      screen.getByText('Esta carga no generó conversación.'),
    ).toBeInTheDocument();
    expect(getTripMessagesMock).not.toHaveBeenCalled();
  });

  it('shows the empty placeholder when messageCount is 0', () => {
    renderThread({ tripId: 'trip-1', messageCount: 0, enabled: true });
    expect(screen.getByText('Sin mensajes intercambiados.')).toBeInTheDocument();
    // NOTE: the useQuery `enabled` is `enabled && !!tripId` and ignores
    // messageCount, so the request still fires even though the render returns
    // the empty placeholder. Asserting current behavior (a minor wasted fetch).
    expect(getTripMessagesMock).toHaveBeenCalledWith('trip-1', { limit: 200 });
  });

  it('renders nothing visible until enabled', () => {
    const { container } = renderThread({
      tripId: 'trip-1',
      messageCount: 2,
      enabled: false,
    });
    expect(container).toBeEmptyDOMElement();
    expect(getTripMessagesMock).not.toHaveBeenCalled();
  });

  it('fetches and renders messages with sender names when enabled', async () => {
    renderThread({ tripId: 'trip-1', messageCount: 2, enabled: true });

    await waitFor(() =>
      expect(getTripMessagesMock).toHaveBeenCalledWith('trip-1', { limit: 200 }),
    );

    expect(await screen.findByText('Hola, cuándo retiran?')).toBeInTheDocument();
    expect(screen.getByText('Mañana a las 8')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders an error message when the query fails', async () => {
    getTripMessagesMock.mockRejectedValue(new Error('boom'));
    renderThread({ tripId: 'trip-1', messageCount: 2, enabled: true });

    expect(
      await screen.findByText(/No se pudieron cargar los mensajes: boom/),
    ).toBeInTheDocument();
  });
});
