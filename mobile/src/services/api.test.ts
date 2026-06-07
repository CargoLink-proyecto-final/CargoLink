import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import api, {
  authApi,
  loadsApi,
  tripsApi,
  messagesApi,
  ratingsApi,
} from './api';

// The fake axios instance lives inside the (hoisted) jest.mock factory so it is
// returned by axios.create before api.ts is evaluated. Each verb is a jest.fn so
// we can assert the exported api groups call them with the right URLs/payloads.
// The request interceptor handler registered by api.ts is captured here.
jest.mock('axios', () => {
  const captured: { requestHandler?: (config: any) => Promise<any> } = {};
  const instance = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    put: jest.fn(),
    interceptors: {
      request: {
        use: jest.fn((handler: (config: any) => Promise<any>) => {
          captured.requestHandler = handler;
        }),
      },
    },
  };
  const create = jest.fn(() => instance);
  const mod: any = { create };
  mod.default = mod;
  mod.__esModule = true;
  mod.__instance = instance;
  mod.__captured = captured;
  return mod;
});

const fakeInstance = (axios as any).__instance;
const getRequestHandler = (): ((config: any) => Promise<any>) =>
  (axios as any).__captured.requestHandler;

describe('api service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('exports the configured axios instance and captured a request interceptor', () => {
    // axios.create / interceptors.request.use are called once at module load.
    // beforeEach's clearAllMocks wipes those call records, so we assert on the
    // observable outcomes instead: api is the fake instance, and the interceptor
    // handler was captured.
    expect(api).toBe(fakeInstance);
    expect(getRequestHandler()).toEqual(expect.any(Function));
  });

  describe('request interceptor', () => {
    it('adds a Bearer Authorization header when a token is stored', async () => {
      await AsyncStorage.setItem('token', 'tok-abc');

      const config = await getRequestHandler()({ headers: {} });

      expect(config.headers.Authorization).toBe('Bearer tok-abc');
    });

    it('omits the Authorization header when no token is stored', async () => {
      const config = await getRequestHandler()({ headers: {} });

      expect(config.headers.Authorization).toBeUndefined();
    });
  });

  describe('authApi', () => {
    it('login posts to /auth/login', () => {
      const data = { email: 'a@b.com', password: 'pw' };
      authApi.login(data);
      expect(fakeInstance.post).toHaveBeenCalledWith('/auth/login', data);
    });

    it('register posts to /auth/register', () => {
      const data = { email: 'a@b.com' };
      authApi.register(data);
      expect(fakeInstance.post).toHaveBeenCalledWith('/auth/register', data);
    });

    it('forgotPassword posts the email', () => {
      authApi.forgotPassword('a@b.com');
      expect(fakeInstance.post).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'a@b.com',
      });
    });

    it('resetPassword posts token + newPassword', () => {
      authApi.resetPassword('tok', 'newpw');
      expect(fakeInstance.post).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'tok',
        newPassword: 'newpw',
      });
    });
  });

  describe('loadsApi', () => {
    it('create posts to /loads', () => {
      const data = { title: 'x' };
      loadsApi.create(data);
      expect(fakeInstance.post).toHaveBeenCalledWith('/loads', data);
    });

    it('getAvailable gets /loads/available with params', () => {
      loadsApi.getAvailable({ page: 1 });
      expect(fakeInstance.get).toHaveBeenCalledWith('/loads/available', {
        params: { page: 1 },
      });
    });

    it('getMy gets /loads/my with params', () => {
      loadsApi.getMy({ status: 'OPEN' });
      expect(fakeInstance.get).toHaveBeenCalledWith('/loads/my', {
        params: { status: 'OPEN' },
      });
    });

    it('getById gets /loads/:id', () => {
      loadsApi.getById('l1');
      expect(fakeInstance.get).toHaveBeenCalledWith('/loads/l1');
    });

    it('cancel deletes /loads/:id', () => {
      loadsApi.cancel('l1');
      expect(fakeInstance.delete).toHaveBeenCalledWith('/loads/l1');
    });
  });

  describe('tripsApi', () => {
    it('accept posts to /trips/accept/:loadId', () => {
      tripsApi.accept('l1');
      expect(fakeInstance.post).toHaveBeenCalledWith('/trips/accept/l1');
    });

    it('getMy gets /trips/my with params', () => {
      tripsApi.getMy({ page: 2 });
      expect(fakeInstance.get).toHaveBeenCalledWith('/trips/my', {
        params: { page: 2 },
      });
    });

    it('getById gets /trips/:id', () => {
      tripsApi.getById('t1');
      expect(fakeInstance.get).toHaveBeenCalledWith('/trips/t1');
    });

    it('start patches /trips/:id/start', () => {
      tripsApi.start('t1');
      expect(fakeInstance.patch).toHaveBeenCalledWith('/trips/t1/start');
    });

    it('complete patches /trips/:id/complete', () => {
      tripsApi.complete('t1');
      expect(fakeInstance.patch).toHaveBeenCalledWith('/trips/t1/complete');
    });

    it('updateLocation patches /trips/:id/location with coords', () => {
      const data = { lat: -34.6, lng: -58.4 };
      tripsApi.updateLocation('t1', data);
      expect(fakeInstance.patch).toHaveBeenCalledWith('/trips/t1/location', data);
    });
  });

  describe('messagesApi', () => {
    it('send posts content to /messages/:receiverId', () => {
      messagesApi.send('u2', 'hello');
      expect(fakeInstance.post).toHaveBeenCalledWith('/messages/u2', {
        content: 'hello',
      });
    });

    it('getConversations gets /messages/conversations', () => {
      messagesApi.getConversations();
      expect(fakeInstance.get).toHaveBeenCalledWith('/messages/conversations');
    });

    it('getConversation gets /messages/conversation/:userId with params', () => {
      messagesApi.getConversation('u2', { page: 1 });
      expect(fakeInstance.get).toHaveBeenCalledWith('/messages/conversation/u2', {
        params: { page: 1 },
      });
    });

    it('markAsRead patches /messages/read/:senderId', () => {
      messagesApi.markAsRead('u2');
      expect(fakeInstance.patch).toHaveBeenCalledWith('/messages/read/u2');
    });
  });

  describe('ratingsApi', () => {
    it('create posts to /ratings', () => {
      const data = { tripId: 't1', score: 5, comment: 'great' };
      ratingsApi.create(data);
      expect(fakeInstance.post).toHaveBeenCalledWith('/ratings', data);
    });

    it('getUserRatings gets /ratings/user/:userId', () => {
      ratingsApi.getUserRatings('u1');
      expect(fakeInstance.get).toHaveBeenCalledWith('/ratings/user/u1');
    });
  });
});
