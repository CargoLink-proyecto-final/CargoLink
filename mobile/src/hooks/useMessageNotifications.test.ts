import { renderHook, waitFor } from '@testing-library/react-native';
import { useMessageNotifications } from './useMessageNotifications';
import { getChatSocket } from '../services/socket';
import { setActiveTripId } from '../services/activeChat';
import {
  registerForPushNotifications,
  scheduleLocalNotification,
} from '../services/notifications';

const mockSocket = { on: jest.fn(), off: jest.fn(), connected: true };
jest.mock('../services/socket', () => ({
  getChatSocket: jest.fn(() => mockSocket),
}));

jest.mock('../services/notifications', () => ({
  registerForPushNotifications: jest.fn(),
  scheduleLocalNotification: jest.fn(),
}));

const listener = () =>
  mockSocket.on.mock.calls.find(([event]) => event === 'newMessage')?.[1];

const incoming = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  senderId: 'other',
  sender: { id: 'other', firstName: 'Otto', lastName: 'Receiver' },
  tripId: 'trip-1',
  content: 'Llego en 20 minutos',
  isRead: false,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('useMessageNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveTripId(null);
    (registerForPushNotifications as jest.Mock).mockResolvedValue(null);
  });

  it('does nothing without a logged-in user', () => {
    renderHook(() => useMessageNotifications(undefined));

    expect(getChatSocket).not.toHaveBeenCalled();
    expect(registerForPushNotifications).not.toHaveBeenCalled();
  });

  it('asks for a push token once the user is known', async () => {
    renderHook(() => useMessageNotifications('me'));

    await waitFor(() => expect(registerForPushNotifications).toHaveBeenCalledTimes(1));
    expect(getChatSocket).toHaveBeenCalledWith('me');
  });

  it('notifies an incoming message from another conversation', () => {
    renderHook(() => useMessageNotifications('me'));

    listener()(incoming());

    expect(scheduleLocalNotification).toHaveBeenCalledWith(
      'Otto Receiver',
      'Llego en 20 minutos',
    );
  });

  it('stays quiet for the conversation the user has open', () => {
    renderHook(() => useMessageNotifications('me'));
    setActiveTripId('trip-1');

    listener()(incoming());

    expect(scheduleLocalNotification).not.toHaveBeenCalled();
  });

  it('stays quiet for the user own messages', () => {
    renderHook(() => useMessageNotifications('me'));

    listener()(incoming({ senderId: 'me' }));

    expect(scheduleLocalNotification).not.toHaveBeenCalled();
  });

  it('falls back to a generic title when the sender is missing', () => {
    renderHook(() => useMessageNotifications('me'));

    listener()(incoming({ sender: undefined }));

    expect(scheduleLocalNotification).toHaveBeenCalledWith(
      'Nuevo mensaje',
      'Llego en 20 minutos',
    );
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useMessageNotifications('me'));

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('newMessage', expect.any(Function));
  });
});
