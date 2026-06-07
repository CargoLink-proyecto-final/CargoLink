import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MessagesPage from './page';

// Isolate the page from the auth-gated layout chrome.
jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const getConversationsMock = jest.fn();
jest.mock('@/lib/api', () => ({
  messagesApi: {
    getConversations: (...args: any[]) => getConversationsMock(...args),
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MessagesPage />
    </QueryClientProvider>,
  );
}

const conversations = [
  {
    tripId: 'trip-1',
    tripStatus: 'IN_PROGRESS',
    loadTitle: 'Granos a Rosario',
    unreadCount: 2,
    otherUser: { firstName: 'Grace', lastName: 'Hopper' },
    lastMessage: { content: 'Salgo en una hora' },
  },
  {
    tripId: 'trip-2',
    tripStatus: 'COMPLETED',
    loadTitle: 'Acero a Córdoba',
    unreadCount: 0,
    otherUser: { firstName: 'Ada', lastName: 'Lovelace' },
    lastMessage: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MessagesPage', () => {
  it('shows a loading state while fetching conversations', () => {
    getConversationsMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Cargando conversaciones...')).toBeInTheDocument();
  });

  it('shows the empty state when there are no conversations', async () => {
    getConversationsMock.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText('Sin conversaciones aún')).toBeInTheDocument();
  });

  it('lists conversations with other-user name, load title and last message', async () => {
    getConversationsMock.mockResolvedValue({ data: conversations });
    renderPage();

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Granos a Rosario')).toBeInTheDocument();
    expect(screen.getByText('Salgo en una hora')).toBeInTheDocument();
    // Falls back to the "start conversation" hint when lastMessage is null.
    expect(screen.getByText('Sin mensajes — iniciar conversación')).toBeInTheDocument();
  });

  it('links each conversation to its trip chat and shows the unread badge', async () => {
    getConversationsMock.mockResolvedValue({ data: conversations });
    renderPage();

    const link = (await screen.findByText('Grace Hopper')).closest('a');
    expect(link).toHaveAttribute('href', '/messages/trip/trip-1');
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
