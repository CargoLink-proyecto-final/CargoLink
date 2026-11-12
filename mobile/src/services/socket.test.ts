import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getChatSocket, disconnectChatSocket } from './socket';
import { refreshSession } from './api';
import { SOCKET_URL } from '../config/env';

const makeSocket = () => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  return {
    connected: true,
    connect: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    on: jest.fn((event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handler;
    }),
    emitLocal: (event: string, ...args: any[]) => handlers[event]?.(...args),
  };
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

jest.mock('./api', () => ({
  refreshSession: jest.fn(),
}));

const flush = () => new Promise((resolve) => setImmediate(resolve));

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

  describe('when the server rejects the connection', () => {
    // Pasa cuando el access token venció con la app en segundo plano: socket.io no
    // reconecta solo tras un corte del server, así que el chat perdía el tiempo real.
    it('renews the session and reconnects', async () => {
      const socket = makeSocket();
      (io as jest.Mock).mockReturnValue(socket);
      (refreshSession as jest.Mock).mockResolvedValue({ accessToken: 'new' });

      getChatSocket('u1');
      socket.emitLocal('disconnect', 'io server disconnect');
      await flush();

      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    it('does not reconnect when the session is dead', async () => {
      const socket = makeSocket();
      (io as jest.Mock).mockReturnValue(socket);
      (refreshSession as jest.Mock).mockResolvedValue(null);

      getChatSocket('u1');
      socket.emitLocal('disconnect', 'io server disconnect');
      await flush();

      expect(socket.connect).not.toHaveBeenCalled();
    });

    it('tries at most once per minute, so a persistent rejection does not loop', async () => {
      const socket = makeSocket();
      (io as jest.Mock).mockReturnValue(socket);
      (refreshSession as jest.Mock).mockResolvedValue({ accessToken: 'new' });

      getChatSocket('u1');
      socket.emitLocal('disconnect', 'io server disconnect');
      await flush();
      socket.emitLocal('disconnect', 'io server disconnect');
      await flush();

      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(socket.connect).toHaveBeenCalledTimes(1);
    });

    it('ignores ordinary network drops, which socket.io retries by itself', async () => {
      const socket = makeSocket();
      (io as jest.Mock).mockReturnValue(socket);

      getChatSocket('u1');
      socket.emitLocal('disconnect', 'transport close');
      await flush();

      expect(refreshSession).not.toHaveBeenCalled();
    });

    it('does not reconnect a socket that was replaced meanwhile', async () => {
      const first = makeSocket();
      const second = makeSocket();
      (io as jest.Mock).mockReturnValueOnce(first).mockReturnValueOnce(second);
      let resolveRefresh: (v: unknown) => void = () => undefined;
      (refreshSession as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      );

      getChatSocket('u1');
      first.emitLocal('disconnect', 'io server disconnect');
      getChatSocket('u2'); // logout + login con otra cuenta
      resolveRefresh({ accessToken: 'new' });
      await flush();

      expect(first.connect).not.toHaveBeenCalled();
    });
  });
});
