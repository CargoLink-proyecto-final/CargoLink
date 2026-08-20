import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatListScreen from './ChatListScreen';
import { messagesApi } from '../../services/api';
import { getChatSocket } from '../../services/socket';

jest.mock('../../services/api', () => ({
  messagesApi: {
    getConversations: jest.fn(),
  },
}));

const mockSocket = { on: jest.fn(), off: jest.fn(), connected: true };
jest.mock('../../services/socket', () => ({
  getChatSocket: jest.fn(() => mockSocket),
}));

let mockUser: any = { id: 'me', firstName: 'Me', lastName: 'User' };

// Consumed as a selector: useAuthStore((s) => s.user)
jest.mock('../../store/auth', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

// Shape returned by GET /messages/conversations — one row per trip.
const conversation = {
  tripId: 'trip-1',
  tripStatus: 'IN_PROGRESS',
  loadTitle: 'Soja a Rosario',
  otherUser: { id: 'other', firstName: 'Otto', lastName: 'Receiver' },
  lastMessage: {
    id: 'm1',
    senderId: 'other',
    tripId: 'trip-1',
    content: 'Hello there',
    isRead: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
  unreadCount: 2,
};

const navigationStub = () => ({ navigate: jest.fn(), addListener: jest.fn() });

describe('ChatListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'me', firstName: 'Me', lastName: 'User' };
  });

  it('lists conversations returned by the API', async () => {
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({ data: [conversation] });

    const { getByText } = render(<ChatListScreen navigation={navigationStub()} />);

    await waitFor(() => expect(getByText('Otto Receiver')).toBeTruthy());
    expect(getByText('Hello there')).toBeTruthy();
    expect(getByText('Soja a Rosario')).toBeTruthy();
  });

  it('shows the unread badge with its count', async () => {
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({ data: [conversation] });

    const { getByText } = render(<ChatListScreen navigation={navigationStub()} />);

    await waitFor(() => expect(getByText('2')).toBeTruthy());
  });

  it('falls back to a placeholder when the trip has no messages yet', async () => {
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({
      data: [{ ...conversation, lastMessage: null, unreadCount: 0 }],
    });

    const { getByText } = render(<ChatListScreen navigation={navigationStub()} />);

    await waitFor(() => expect(getByText('Sin mensajes todavía')).toBeTruthy());
  });

  it('shows the empty state when there are no conversations', async () => {
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({ data: [] });

    const { getByText } = render(<ChatListScreen navigation={navigationStub()} />);

    await waitFor(() => expect(getByText('Aún no hay conversaciones')).toBeTruthy());
  });

  it('navigates to the Chat screen with the trip id when a card is pressed', async () => {
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({ data: [conversation] });
    const navigation = navigationStub();

    const { getByText } = render(<ChatListScreen navigation={navigation} />);

    await waitFor(() => expect(getByText('Otto Receiver')).toBeTruthy());
    fireEvent.press(getByText('Otto Receiver'));

    expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
      tripId: 'trip-1',
      name: 'Otto Receiver',
      loadTitle: 'Soja a Rosario',
    });
  });

  it('refetches when a message arrives over the socket', async () => {
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({ data: [conversation] });

    render(<ChatListScreen navigation={navigationStub()} />);

    await waitFor(() => expect(messagesApi.getConversations).toHaveBeenCalledTimes(1));
    expect(getChatSocket).toHaveBeenCalledWith('me');

    const handler = mockSocket.on.mock.calls.find(([event]) => event === 'newMessage')?.[1];
    expect(handler).toBeDefined();
    handler();

    await waitFor(() => expect(messagesApi.getConversations).toHaveBeenCalledTimes(2));
  });
});
