import { Test, TestingModule } from '@nestjs/testing';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MessagesGateway', () => {
  let gateway: MessagesGateway;
  let messagesService: { create: jest.Mock };
  let prisma: { trip: { findMany: jest.Mock } };

  // Mock Socket.IO server with chainable .to().emit()
  let serverEmit: jest.Mock;
  let server: { to: jest.Mock };

  const makeClient = (query: Record<string, unknown> = {}) => ({
    handshake: { query },
    join: jest.fn(),
  });

  beforeEach(async () => {
    messagesService = { create: jest.fn() };
    prisma = { trip: { findMany: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesGateway,
        { provide: MessagesService, useValue: messagesService },
        { provide: PrismaService, useValue: prisma },
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
      const client = makeClient({ userId: 'user-1' });
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
      const client = makeClient({ userId: 'user-1' });
      prisma.trip.findMany.mockResolvedValue([]);

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledTimes(1);
      expect(client.join).toHaveBeenCalledWith('user_user-1');
    });

    it('returns early and joins nothing when userId is missing', async () => {
      const client = makeClient({});

      await gateway.handleConnection(client as any);

      expect(client.join).not.toHaveBeenCalled();
      expect(prisma.trip.findMany).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('does not throw (room cleanup is handled by Socket.IO)', () => {
      const client = makeClient({ userId: 'user-1' });
      expect(() => gateway.handleDisconnect(client as any)).not.toThrow();
    });
  });

  describe('handleMessage', () => {
    it('persists the message and broadcasts it to the trip room', async () => {
      const client = makeClient({ userId: 'user-1' });
      const payload = { senderId: 'user-1', tripId: 'trip-1', content: 'hi' };
      const created = { id: 'msg-1', content: 'hi' };
      messagesService.create.mockResolvedValue(created);

      const result = await gateway.handleMessage(client as any, payload);

      expect(messagesService.create).toHaveBeenCalledWith('user-1', 'trip-1', 'hi');
      expect(server.to).toHaveBeenCalledWith('trip_trip-1');
      expect(serverEmit).toHaveBeenCalledWith('newMessage', created);
      expect(result).toBe(created);
    });

    it('propagates errors thrown by the service (e.g. not a participant)', async () => {
      const client = makeClient({ userId: 'stranger' });
      const payload = { senderId: 'stranger', tripId: 'trip-1', content: 'hi' };
      messagesService.create.mockRejectedValue(new Error('No eres participante'));

      await expect(
        gateway.handleMessage(client as any, payload),
      ).rejects.toThrow('No eres participante');
      expect(server.to).not.toHaveBeenCalled();
    });
  });
});
