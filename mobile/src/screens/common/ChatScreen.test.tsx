import React from 'react';
import { FlatList, TouchableOpacity } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatScreen from './ChatScreen';
import { messagesApi } from '../../services/api';
import { getChatSocket } from '../../services/socket';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('../../services/api', () => ({
  messagesApi: {
    getTripMessages: jest.fn(),
    markAsRead: jest.fn(),
    send: jest.fn(),
  },
}));

// `timeout(ms).emit(...)` es la forma con ack de socket.io-client v4.
const mockEmit = jest.fn();
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  connected: true,
  timeout: jest.fn(() => ({ emit: mockEmit })),
};
jest.mock('../../services/socket', () => ({
  getChatSocket: jest.fn(() => mockSocket),
}));

const mockUser = { id: 'me', firstName: 'Me', lastName: 'User' };

// Consumed as a selector: useAuthStore((s) => s.user)
jest.mock('../../store/auth', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

const messages = [
  {
    id: 'mine',
    senderId: 'me',
    tripId: 'trip-1',
    content: 'Hi from me',
    isRead: true,
    createdAt: '2026-01-01T10:00:00Z',
  },
  {
    id: 'theirs',
    senderId: 'other',
    tripId: 'trip-1',
    content: 'Hi from them',
    isRead: true,
    createdAt: '2026-01-01T10:01:00Z',
  },
];

const makeRoute = () => ({ params: { tripId: 'trip-1', name: 'Otto' } });

const listener = (event: string) =>
  mockSocket.on.mock.calls.find(([name]) => name === event)?.[1];

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.connected = true;
    (messagesApi.getTripMessages as jest.Mock).mockResolvedValue({ data: { messages } });
    (messagesApi.markAsRead as jest.Mock).mockResolvedValue({});
    (messagesApi.send as jest.Mock).mockResolvedValue({ data: null });
  });

  it('fetches the trip conversation and marks it as read on mount', async () => {
    render(<ChatScreen route={makeRoute()} />);

    await waitFor(() => expect(messagesApi.getTripMessages).toHaveBeenCalledWith('trip-1'));
    expect(messagesApi.markAsRead).toHaveBeenCalledWith('trip-1');
  });

  it('renders both incoming and outgoing message bubbles', async () => {
    const { getByText } = render(<ChatScreen route={makeRoute()} />);

    await waitFor(() => expect(getByText('Hi from me')).toBeTruthy());
    expect(getByText('Hi from them')).toBeTruthy();
  });

  it('sends over the socket when it is connected', async () => {
    const screen = render(<ChatScreen route={makeRoute()} />);
    const { getByPlaceholderText, UNSAFE_getAllByType } = screen;

    await waitFor(() => expect(messagesApi.getTripMessages).toHaveBeenCalled());

    const input = getByPlaceholderText('Escribe un mensaje...');
    fireEvent.changeText(input, 'New message');
    fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);

    await waitFor(() =>
      expect(mockEmit).toHaveBeenCalledWith(
        'sendMessage',
        { senderId: 'me', tripId: 'trip-1', content: 'New message' },
        expect.any(Function),
      ),
    );
    // El POST REST no dispara el broadcast del gateway: con socket vivo no se usa.
    expect(messagesApi.send).not.toHaveBeenCalled();
    await waitFor(() => expect(input.props.value).toBe(''));
  });

  it('falls back to the REST endpoint when the socket is down', async () => {
    mockSocket.connected = false;
    const screen = render(<ChatScreen route={makeRoute()} />);
    const { getByPlaceholderText, UNSAFE_getAllByType } = screen;

    await waitFor(() => expect(messagesApi.getTripMessages).toHaveBeenCalled());

    fireEvent.changeText(getByPlaceholderText('Escribe un mensaje...'), 'Offline msg');
    fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);

    await waitFor(() =>
      expect(messagesApi.send).toHaveBeenCalledWith('trip-1', 'Offline msg'),
    );
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('restores the typed text in the input when the REST send fails', async () => {
    mockSocket.connected = false;
    (messagesApi.send as jest.Mock).mockRejectedValue(new Error('network'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const screen = render(<ChatScreen route={makeRoute()} />);
    const { getByPlaceholderText, UNSAFE_getAllByType } = screen;

    await waitFor(() => expect(messagesApi.getTripMessages).toHaveBeenCalled());

    const input = getByPlaceholderText('Escribe un mensaje...');
    fireEvent.changeText(input, 'Will fail');
    fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);

    await waitFor(() => expect(input.props.value).toBe('Will fail'));
  });

  it('appends a message pushed over the socket for this trip', async () => {
    const { getByText, queryByText } = render(<ChatScreen route={makeRoute()} />);

    await waitFor(() => expect(getByText('Hi from me')).toBeTruthy());

    const onNewMessage = listener('newMessage');
    expect(onNewMessage).toBeDefined();

    onNewMessage({
      id: 'pushed',
      senderId: 'other',
      tripId: 'trip-1',
      content: 'Realtime hello',
      isRead: false,
      createdAt: '2026-01-01T10:02:00Z',
    });

    await waitFor(() => expect(getByText('Realtime hello')).toBeTruthy());

    // Un mensaje de otro viaje no tiene que aparecer acá: el socket está unido a
    // todas las conversaciones del usuario, no sólo a la abierta.
    onNewMessage({
      id: 'other-trip',
      senderId: 'other',
      tripId: 'trip-2',
      content: 'Wrong trip',
      isRead: false,
      createdAt: '2026-01-01T10:03:00Z',
    });

    await waitFor(() => expect(queryByText('Wrong trip')).toBeNull());
  });

  it('ignores a duplicate id so the bubble is not rendered twice', async () => {
    const { getAllByText, getByText } = render(<ChatScreen route={makeRoute()} />);

    await waitFor(() => expect(getByText('Hi from them')).toBeTruthy());

    listener('newMessage')(messages[1]);

    await waitFor(() => expect(getAllByText('Hi from them')).toHaveLength(1));
  });

  it('shows the offline banner while the socket is disconnected', async () => {
    mockSocket.connected = false;
    const { getByText } = render(<ChatScreen route={makeRoute()} />);

    await waitFor(() =>
      expect(getByText('Sin conexión en vivo — actualizando cada 3s')).toBeTruthy(),
    );
  });

  it('does not send when the input is empty', async () => {
    const screen = render(<ChatScreen route={makeRoute()} />);
    const { UNSAFE_getAllByType } = screen;

    await waitFor(() => expect(messagesApi.getTripMessages).toHaveBeenCalled());

    fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);

    expect(messagesApi.send).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('keeps a socket message that arrives while a refetch is in flight', async () => {
    const { getByText, queryByText } = render(<ChatScreen route={makeRoute()} />);
    await waitFor(() => expect(getByText('Hi from me')).toBeTruthy());

    // Llega por socket y no está en lo que devolverá el próximo refetch.
    listener('newMessage')({
      id: 'pushed',
      senderId: 'other',
      tripId: 'trip-1',
      content: 'Mensaje en vuelo',
      isRead: false,
      createdAt: '2026-01-01T10:02:00Z',
    });
    await waitFor(() => expect(getByText('Mensaje en vuelo')).toBeTruthy());

    // El refetch de la reconexión trae sólo la página del server.
    listener('connect')();

    await waitFor(() => expect(messagesApi.getTripMessages).toHaveBeenCalledTimes(2));
    // Un reemplazo lo habría borrado; el merge lo conserva.
    expect(queryByText('Mensaje en vuelo')).toBeTruthy();
  });

  it('keeps the merged conversation in chronological order', async () => {
    // El endpoint devuelve sólo la última página, así que un mensaje viejo que
    // quedó fuera puede seguir en memoria: concatenar sin ordenar lo mandaría al
    // final y `scrollToEnd` llevaría ahí.
    const { UNSAFE_getAllByType, getByText } = render(<ChatScreen route={makeRoute()} />);
    await waitFor(() => expect(getByText('Hi from me')).toBeTruthy());

    listener('newMessage')({
      id: 'old',
      senderId: 'other',
      tripId: 'trip-1',
      content: 'El mas viejo',
      isRead: true,
      createdAt: '2026-01-01T09:00:00Z',
    });
    await waitFor(() => expect(getByText('El mas viejo')).toBeTruthy());

    listener('connect')();
    await waitFor(() => expect(messagesApi.getTripMessages).toHaveBeenCalledTimes(2));

    const list = UNSAFE_getAllByType(FlatList)[0];
    await waitFor(() =>
      expect((list.props.data as any[]).map((m) => m.id)).toEqual([
        'old',
        'mine',
        'theirs',
      ]),
    );
  });

  it('wires the socket for the logged-in user', async () => {
    render(<ChatScreen route={makeRoute()} />);

    await waitFor(() => expect(getChatSocket).toHaveBeenCalledWith('me'));
  });
});
