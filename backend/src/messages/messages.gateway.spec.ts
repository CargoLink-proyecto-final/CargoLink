import { Test, TestingModule } from '@nestjs/testing';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../push/presence.service';
import { ChatBroadcaster } from './chat-broadcaster';
import { SocketAuthService } from '../auth/socket-auth.service';

describe('MessagesGateway', () => {
  let gateway: MessagesGateway;
  let messagesService: { create: jest.Mock };
  let prisma: { trip: { findMany: jest.Mock } };
  let broadcaster: { register: jest.Mock; emitNewMessage: jest.Mock };

  // Mock Socket.IO server with chainable .to().emit()
  let serverEmit: jest.Mock;
  let server: { to: jest.Mock };

  let socketAuth: { authenticate: jest.Mock };

  const makeClient = (
    opts: { token?: string; query?: Record<string, unknown>; userId?: string } = {},
  ) => ({
    handshake: {
      auth: opts.token ? { token: opts.token } : {},
      headers: {},
      query: opts.query ?? {},
    },
    data: opts.userId ? { userId: opts.userId } : ({} as Record<string, unknown>),
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  });

  beforeEach(async () => {
    socketAuth = {
      authenticate: jest.fn(async (token?: string) =>
        token === 'valid-token' ? { id: 'user-1', role: 'TRANSPORTER' } : null,
      ),
    };
    messagesService = { create: jest.fn() };
    prisma = { trip: { findMany: jest.fn() } };
    broadcaster = { register: jest.fn(), emitNewMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesGateway,
        { provide: MessagesService, useValue: messagesService },
        { provide: PrismaService, useValue: prisma },
        { provide: ChatBroadcaster, useValue: broadcaster },
        { provide: SocketAuthService, useValue: socketAuth },
        // Real y no mock: es un contador en memoria sin dependencias, y así los
        // tests verifican de verdad el conteo de conexiones.
        PresenceService,
      ],
    }).compile();

    gateway = module.get<MessagesGateway>(MessagesGateway);

    serverEmit = jest.fn();
    server = { to: jest.fn().mockReturnValue({ emit: serverEmit }) };
    gateway.server = server as any;
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('joins the user room and every participating trip room', async () => {
      const client = makeClient({ token: 'valid-token' });
      prisma.trip.findMany.mockResolvedValue([{ id: 'trip-1' }, { id: 'trip-2' }]);

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('user_user-1');
      expect(client.join).toHaveBeenCalledWith('trip_trip-1');
      expect(client.join).toHaveBeenCalledWith('trip_trip-2');
      expect(prisma.trip.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ carrierId: 'user-1' }, { load: { shipperId: 'user-1' } }],
          status: { in: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] },
        },
        select: { id: true },
      });
    });

    it('joins the user room even when there are no trips', async () => {
      const client = makeClient({ token: 'valid-token' });
      prisma.trip.findMany.mockResolvedValue([]);

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledTimes(1);
      expect(client.join).toHaveBeenCalledWith('user_user-1');
    });

    it('disconnects and joins nothing when there is no token', async () => {
      const client = makeClient();

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
      expect(prisma.trip.findMany).not.toHaveBeenCalled();
    });

    // El agujero que cierra este cambio: antes alcanzaba con `?userId=<ajeno>`
    // para recibir los chats y la ubicación de los viajes de otra persona.
    it('ignores a spoofed userId in the query string', async () => {
      const client = makeClient({ query: { userId: 'victim' } });

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired token', async () => {
      const client = makeClient({ token: 'forged' });

      await gateway.handleConnection(client as any);

      expect(client.emit).toHaveBeenCalledWith('unauthorized', expect.any(Object));
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('takes the identity from the token, not from the query', async () => {
      const client = makeClient({ token: 'valid-token', query: { userId: 'victim' } });
      prisma.trip.findMany.mockResolvedValue([]);

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('user_user-1');
      expect(client.join).not.toHaveBeenCalledWith('user_victim');
      expect(client.data.userId).toBe('user-1');
    });
  });

  describe('handleDisconnect', () => {
    it('does not throw (room cleanup is handled by Socket.IO)', () => {
      const client = makeClient({ userId: 'user-1' });
      (client as any).id = 'socket-1';
      expect(() => gateway.handleDisconnect(client as any)).not.toThrow();
    });
  });

  describe('afterInit', () => {
    // Sin esto el service emitiría contra un broadcaster sin servidor y los
    // mensajes no llegarían en vivo a nadie.
    it('hands the socket server to the broadcaster', () => {
      gateway.afterInit(server as any);

      expect(broadcaster.register).toHaveBeenCalledWith(server);
    });
  });

  describe('handleMessage', () => {
    // El emit ya no vive acá: lo hace el service, para que los mensajes que
    // entran por REST (el camino del web) también se difundan.
    it('delegates to the service without broadcasting twice', async () => {
      const client = makeClient({ userId: 'user-1' });
      const payload = { tripId: 'trip-1', content: 'hi' };
      const created = { id: 'msg-1', content: 'hi' };
      messagesService.create.mockResolvedValue(created);

      const result = await gateway.handleMessage(client as any, payload);

      expect(messagesService.create).toHaveBeenCalledWith('user-1', 'trip-1', 'hi');
      expect(serverEmit).not.toHaveBeenCalled();
      expect(result).toBe(created);
    });

    it('propagates errors thrown by the service (e.g. not a participant)', async () => {
      const client = makeClient({ userId: 'stranger' });
      const payload = { tripId: 'trip-1', content: 'hi' };
      messagesService.create.mockRejectedValue(new Error('No eres participante'));

      await expect(
        gateway.handleMessage(client as any, payload),
      ).rejects.toThrow('No eres participante');
      expect(server.to).not.toHaveBeenCalled();
    });

    it('uses the socket owner as sender and ignores a senderId in the payload', async () => {
      const client = makeClient({ userId: 'user-1' });
      messagesService.create.mockResolvedValue({ id: 'msg-1' });

      await gateway.handleMessage(client as any, {
        senderId: 'victim',
        tripId: 'trip-1',
        content: 'hi',
      } as any);

      expect(messagesService.create).toHaveBeenCalledWith('user-1', 'trip-1', 'hi');
    });

    it('rejects messages from a socket that never authenticated', async () => {
      const client = makeClient();

      await expect(
        gateway.handleMessage(client as any, { tripId: 'trip-1', content: 'hi' }),
      ).rejects.toThrow('No autenticado');
      expect(messagesService.create).not.toHaveBeenCalled();
    });
  });
});
