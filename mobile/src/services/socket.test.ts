import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getChatSocket, disconnectChatSocket } from './socket';
import { SOCKET_URL } from '../config/env';

const makeSocket = () => ({
  connected: true,
  connect: jest.fn(),
  disconnect: jest.fn(),
  removeAllListeners: jest.fn(),
});

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

describe('chat socket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disconnectChatSocket();
    (io as jest.Mock).mockImplementation(() => makeSocket());
  });

  it('connects to the /chat namespace authenticating with the stored token', async () => {
    await AsyncStorage.setItem('token', 'access-token');
    getChatSocket('u1');

    const options = (io as jest.Mock).mock.calls[0][1];
    expect((io as jest.Mock).mock.calls[0][0]).toBe(`${SOCKET_URL}/chat`);
    expect(options.transports).toEqual(['websocket']);
    // El userId ya no viaja: el server lo saca del token.
    expect(options.query).toBeUndefined();

    const payload = await new Promise((resolve) => options.auth(resolve));
    expect(payload).toEqual({ token: 'access-token' });
  });

  it('reuses the same socket for the same user', () => {
    const first = getChatSocket('u1');
    const second = getChatSocket('u1');

    expect(second).toBe(first);
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('reconnects a dropped socket instead of creating a new one', () => {
    const socket = makeSocket();
    socket.connected = false;
    (io as jest.Mock).mockReturnValue(socket);

    getChatSocket('u1');
    getChatSocket('u1');

    expect(io).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('drops the previous socket when the user changes', () => {
    const first = makeSocket();
    const second = makeSocket();
    (io as jest.Mock).mockReturnValueOnce(first).mockReturnValueOnce(second);

    getChatSocket('u1');
    const result = getChatSocket('u2');

    // Las rooms del socket viejo son las del usuario viejo: hay que cerrarlo.
    expect(first.disconnect).toHaveBeenCalled();
    expect(first.removeAllListeners).toHaveBeenCalled();
    expect(result).toBe(second);
    expect(io).toHaveBeenCalledTimes(2);
  });

  it('disconnectChatSocket tears down the current socket', () => {
    const socket = makeSocket();
    (io as jest.Mock).mockReturnValue(socket);

    getChatSocket('u1');
    disconnectChatSocket();

    expect(socket.disconnect).toHaveBeenCalled();

    // Después de cerrarlo, el próximo pedido crea una conexión nueva.
    getChatSocket('u1');
    expect(io).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when there is nothing connected', () => {
    expect(() => disconnectChatSocket()).not.toThrow();
  });
});
