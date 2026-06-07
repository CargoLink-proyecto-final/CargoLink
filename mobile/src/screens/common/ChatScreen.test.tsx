import React from 'react';
import { TouchableOpacity } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatScreen from './ChatScreen';
import { messagesApi } from '../../services/api';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('../../services/api', () => ({
  messagesApi: {
    getConversation: jest.fn(),
    markAsRead: jest.fn(),
    send: jest.fn(),
  },
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
    content: 'Hi from me',
    isRead: true,
    createdAt: '2026-01-01T10:00:00Z',
  },
  {
    id: 'theirs',
    senderId: 'other',
    content: 'Hi from them',
    isRead: true,
    createdAt: '2026-01-01T10:01:00Z',
  },
];

const makeRoute = () => ({ params: { userId: 'other', name: 'Otto' } });

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (messagesApi.getConversation as jest.Mock).mockResolvedValue({ data: { messages } });
    (messagesApi.markAsRead as jest.Mock).mockResolvedValue({});
    (messagesApi.send as jest.Mock).mockResolvedValue({});
  });

  it('fetches the conversation and marks it as read on mount', async () => {
    render(<ChatScreen route={makeRoute()} />);

    await waitFor(() => expect(messagesApi.getConversation).toHaveBeenCalledWith('other'));
    expect(messagesApi.markAsRead).toHaveBeenCalledWith('other');
  });

  it('renders both incoming and outgoing message bubbles', async () => {
    const { getByText } = render(<ChatScreen route={makeRoute()} />);

    await waitFor(() => expect(getByText('Hi from me')).toBeTruthy());
    expect(getByText('Hi from them')).toBeTruthy();
  });

  it('sends a typed message via messagesApi.send and clears the input', async () => {
    const screen = render(<ChatScreen route={makeRoute()} />);
    const { getByPlaceholderText, UNSAFE_getAllByType } = screen;

    await waitFor(() => expect(messagesApi.getConversation).toHaveBeenCalled());

    const input = getByPlaceholderText('Escribe un mensaje...');
    fireEvent.changeText(input, 'New message');

    // The send button is the sole TouchableOpacity on this screen.
    const sendBtn = UNSAFE_getAllByType(TouchableOpacity)[0];
    fireEvent.press(sendBtn);

    await waitFor(() =>
      expect(messagesApi.send).toHaveBeenCalledWith('other', 'New message'),
    );
    // After sending, input is cleared.
    await waitFor(() => expect(input.props.value).toBe(''));
    // It re-fetches the conversation after sending.
    expect(messagesApi.getConversation).toHaveBeenCalledTimes(2);
  });

  it('does not send when the input is empty', async () => {
    const screen = render(<ChatScreen route={makeRoute()} />);
    const { UNSAFE_getAllByType } = screen;

    await waitFor(() => expect(messagesApi.getConversation).toHaveBeenCalled());

    const sendBtn = UNSAFE_getAllByType(TouchableOpacity)[0];
    fireEvent.press(sendBtn);

    expect(messagesApi.send).not.toHaveBeenCalled();
  });
});
