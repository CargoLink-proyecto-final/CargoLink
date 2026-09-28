import { ChatBroadcaster } from './chat-broadcaster';

describe('ChatBroadcaster', () => {
  let broadcaster: ChatBroadcaster;
  const emit = jest.fn();
  const server = { to: jest.fn().mockReturnValue({ emit }) };

  beforeEach(() => {
    jest.clearAllMocks();
    broadcaster = new ChatBroadcaster();
  });

  it('emits to the room of the trip once the server is registered', () => {
    broadcaster.register(server as any);
    const message = { id: 'msg-1', content: 'Llego en 20' };

    broadcaster.emitNewMessage('trip-1', message);

    expect(server.to).toHaveBeenCalledWith('trip_trip-1');
    expect(emit).toHaveBeenCalledWith('newMessage', message);
  });

  // Un mensaje ya guardado no puede fallar porque el socket no esté listo.
  it('warns instead of throwing when no server was registered yet', () => {
    const warn = jest.spyOn(broadcaster['logger'], 'warn').mockImplementation(() => {});

    expect(() => broadcaster.emitNewMessage('trip-1', { id: 'm' })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
