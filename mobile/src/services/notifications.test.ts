import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  registerForPushNotifications,
  scheduleLocalNotification,
  addNotificationListener,
  addNotificationResponseListener,
} from './notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

// Mutable backing value so individual tests can flip isDevice. The mock object
// exposes it via a getter because the babel ESM namespace can be frozen.
let mockDeviceIsDevice = true;
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDeviceIsDevice;
  },
}));

const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;

describe('notifications service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockDeviceIsDevice = true;
    Platform.OS = 'ios';
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore?.();
  });

  describe('registerForPushNotifications', () => {
    it('returns null when not running on a physical device', async () => {
      mockDeviceIsDevice = false;

      const token = await registerForPushNotifications();

      expect(token).toBeNull();
      expect(mockedNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    });

    it('returns null when permission is denied', async () => {
      mockedNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'denied',
      } as any);
      mockedNotifications.requestPermissionsAsync.mockResolvedValue({
        status: 'denied',
      } as any);

      const token = await registerForPushNotifications();

      expect(token).toBeNull();
      expect(mockedNotifications.requestPermissionsAsync).toHaveBeenCalled();
      expect(mockedNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    });

    it('requests permission when not already granted', async () => {
      mockedNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
      } as any);
      mockedNotifications.requestPermissionsAsync.mockResolvedValue({
        status: 'granted',
      } as any);
      mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
        data: 'ExponentPushToken[xyz]',
      } as any);

      const token = await registerForPushNotifications();

      expect(mockedNotifications.requestPermissionsAsync).toHaveBeenCalled();
      expect(token).toBe('ExponentPushToken[xyz]');
    });

    it('does not re-request permission when already granted', async () => {
      mockedNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'granted',
      } as any);
      mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
        data: 'ExponentPushToken[abc]',
      } as any);

      const token = await registerForPushNotifications();

      expect(mockedNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(token).toBe('ExponentPushToken[abc]');
    });

    it('returns the expo push token on success', async () => {
      mockedNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'granted',
      } as any);
      mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
        data: 'ExponentPushToken[success]',
      } as any);

      const token = await registerForPushNotifications();

      expect(token).toBe('ExponentPushToken[success]');
    });

    it('configures the android notification channel on android', async () => {
      Platform.OS = 'android';
      mockedNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'granted',
      } as any);
      mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
        data: 'ExponentPushToken[android]',
      } as any);

      await registerForPushNotifications();

      expect(mockedNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
        }),
      );
    });

    it('does not configure a channel on ios', async () => {
      Platform.OS = 'ios';
      mockedNotifications.getPermissionsAsync.mockResolvedValue({
        status: 'granted',
      } as any);
      mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
        data: 'ExponentPushToken[ios]',
      } as any);

      await registerForPushNotifications();

      expect(mockedNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    });
  });

  describe('scheduleLocalNotification', () => {
    it('schedules an immediate notification (trigger null)', () => {
      scheduleLocalNotification('Title', 'Body');

      expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: { title: 'Title', body: 'Body', sound: true },
        trigger: null,
      });
    });
  });

  describe('listener helpers', () => {
    it('addNotificationListener delegates to addNotificationReceivedListener', () => {
      const cb = jest.fn();
      const sub = { remove: jest.fn() };
      mockedNotifications.addNotificationReceivedListener.mockReturnValue(sub as any);

      const result = addNotificationListener(cb);

      expect(mockedNotifications.addNotificationReceivedListener).toHaveBeenCalledWith(cb);
      expect(result).toBe(sub);
    });

    it('addNotificationResponseListener delegates to addNotificationResponseReceivedListener', () => {
      const cb = jest.fn();
      const sub = { remove: jest.fn() };
      mockedNotifications.addNotificationResponseReceivedListener.mockReturnValue(
        sub as any,
      );

      const result = addNotificationResponseListener(cb);

      expect(
        mockedNotifications.addNotificationResponseReceivedListener,
      ).toHaveBeenCalledWith(cb);
      expect(result).toBe(sub);
    });
  });
});
