import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripConversationPage from './page';

jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ tripId: 't1' }),
}));

jest.mock('@/store/auth', () => ({
  useAuthStore: (sel?: (s: any) => any) => {
    const state = { user: { id: 'me', role: 'TRANSPORTER' } };
    return sel ? sel(state) : state;
  },
}));

const api = {
  getTripMessages: jest.fn(),
  send: jest.fn(),
  markAsRead: jest.fn(),
  getById: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  messagesApi: {
    getTripMessages: (...a: any[]) => api.getTripMessages(...a),
    send: (...a: any[]) => api.send(...a),
    markAsRead: (...a: any[]) => api.markAsRead(...a),
  },
  tripsApi: {
    getById: (...a: any[]) => api.getById(...a),
  },
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TripConversationPage />
    </QueryClientProvider>,
  );
}

const trip = {
  id: 't1',
  carrierId: 'me',
  status: 'IN_PROGRESS',
  load: { title: 'Granos a Rosario', shipper: { firstName: 'Grace', lastName: 'Hopper' } },
  carrier: { firstName: 'Ada', lastName: 'Lovelace' },
};

const messages = [
  {
    id: 'm1',
    senderId: 'other',
    sender: { firstName: 'Grace', lastName: 'Hopper' },
    content: 'Hola, cuándo retiran?',
    createdAt: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'm2',
    senderId: 'me',
    sender: { firstName: 'Ada', lastName: 'Lovelace' },
    content: 'Mañana a las 8',
    createdAt: '2026-01-10T10:05:00.000Z',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  api.getById.mockResolvedValue({ data: trip });
  api.getTripMessages.mockResolvedValue({ data: { messages } });
  api.send.mockResolvedValue({ data: {} });
  api.markAsRead.mockResolvedValue({ data: {} });
});

describe('TripConversationPage', () => {
  it('fetches messages for the tripId from useParams', async () => {
    renderPage();
    await waitFor(() =>
      expect(api.getTripMessages).toHaveBeenCalledWith('t1'),
    );
    expect(api.getById).toHaveBeenCalledWith('t1');
  });

  it('renders the message thread with sender names and content', async () => {
    renderPage();
    expect(await screen.findByText('Hola, cuándo retiran?')).toBeInTheDocument();
    expect(screen.getByText('Mañana a las 8')).toBeInTheDocument();
    // "Grace Hopper" appears both in the chat header (the other user) and in
    // the message bubble's sender label, so match all occurrences.
    expect(screen.getAllByText('Grace Hopper').length).toBeGreaterThan(0);
  });

  it('marks the conversation as read for non-admin users', async () => {
    renderPage();
    await waitFor(() => expect(api.markAsRead).toHaveBeenCalledWith('t1'));
  });

  it('sends a message via messagesApi.send and clears the input', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mañana a las 8');

    const input = screen.getByPlaceholderText('Escribe un mensaje...');
    await user.type(input, 'En camino');
    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(api.send).toHaveBeenCalledWith('t1', 'En camino'));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('does not send when the input is empty (button stays disabled)', async () => {
    renderPage();
    await screen.findByText('Mañana a las 8');
    expect(screen.getByRole('button')).toBeDisabled();
    expect(api.send).not.toHaveBeenCalled();
  });

  it('shows the empty placeholder when there are no messages', async () => {
    api.getTripMessages.mockResolvedValue({ data: { messages: [] } });
    renderPage();
    expect(
      await screen.findByText('No hay mensajes aún. Envía el primero.'),
    ).toBeInTheDocument();
  });
});
