import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatListScreen from './ChatListScreen';
import { messagesApi } from '../../services/api';

jest.mock('../../services/api', () => ({
  messagesApi: {
    getConversations: jest.fn(),
  },
}));

let mockUser: any = { id: 'me', firstName: 'Me', lastName: 'User' };

// Consumed as a selector: useAuthStore((s) => s.user)
jest.mock('../../store/auth', () => ({
  useAuthStore: (selector: any) => selector({ user: mockUser }),
}));

const conversation = {
  id: 'm1',
  senderId: 'me',
  sender: { id: 'me', firstName: 'Me', lastName: 'User' },
  receiverId: 'other',
  receiver: { id: 'other', firstName: 'Otto', lastName: 'Receiver' },
  content: 'Hello there',
  isRead: true,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('ChatListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'me', firstName: 'Me', lastName: 'User' };
  });

  it('lists conversations returned by the API', async () => {
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({ data: [conversation] });

    const { getByText } = render(<ChatListScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(getByText('Otto Receiver')).toBeTruthy());
    expect(getByText('Hello there')).toBeTruthy();
  });

  it('shows the empty state when there are no conversations', async () => {
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({ data: [] });

    const { getByText } = render(<ChatListScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(getByText('Aún no hay conversaciones')).toBeTruthy());
  });

  it('navigates to the Chat screen with the other user when a card is pressed', async () => {
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({ data: [conversation] });
    const navigate = jest.fn();

    const { getByText } = render(<ChatListScreen navigation={{ navigate }} />);

    await waitFor(() => expect(getByText('Otto Receiver')).toBeTruthy());
    fireEvent.press(getByText('Otto Receiver'));

    expect(navigate).toHaveBeenCalledWith('Chat', {
      userId: 'other',
      name: 'Otto Receiver',
    });
  });

  it('picks the sender as the other user when the current user is the receiver', async () => {
    const incoming = {
      ...conversation,
      id: 'm2',
      senderId: 'other',
      sender: { id: 'other', firstName: 'Otto', lastName: 'Receiver' },
      receiverId: 'me',
      receiver: { id: 'me', firstName: 'Me', lastName: 'User' },
      isRead: false,
    };
    (messagesApi.getConversations as jest.Mock).mockResolvedValue({ data: [incoming] });

    const { getByText } = render(<ChatListScreen navigation={{ navigate: jest.fn() }} />);

    await waitFor(() => expect(getByText('Otto Receiver')).toBeTruthy());
  });
});
