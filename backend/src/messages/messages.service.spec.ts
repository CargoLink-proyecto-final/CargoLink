import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { ChatBroadcaster } from './chat-broadcaster';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: {
    user: { findUnique: jest.Mock };
    trip: { findUnique: jest.Mock; findMany: jest.Mock };
    message: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let push: { notify: jest.Mock };
  let broadcaster: { register: jest.Mock; emitNewMessage: jest.Mock };

  const carrierId = 'carrier-1';
  const shipperId = 'shipper-1';
  const tripId = 'trip-1';

  const baseTrip = {
    id: tripId,
    carrierId,
    status: 'IN_PROGRESS',
    load: { shipperId },
  };

  beforeEach(async () => {
    prisma = {
      // `validateTripParticipant` chequea que la cuenta siga activa: el gateway
      // de sockets no valida JWT, así que ese corte vive acá.
      user: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
      trip: { findUnique: jest.fn(), findMany: jest.fn() },
      message: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    push = { notify: jest.fn().mockResolvedValue(undefined) };
    broadcaster = { register: jest.fn(), emitNewMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PushService, useValue: push },
        { provide: ChatBroadcaster, useValue: broadcaster },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a message from the carrier to the shipper', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      const created = { id: 'msg-1' };
      prisma.message.create.mockResolvedValue(created);

      const result = await service.create(carrierId, tripId, 'hello');

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { senderId: carrierId, receiverId: shipperId, tripId, content: 'hello' },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      expect(result).toBe(created);
    });

    // El bug que arregla esto: el emit vivía en el handler del socket, así que un
    // mensaje escrito desde el web (que entra por REST) no llegaba en vivo a la
    // app y la conversación quedaba congelada del otro lado.
    it('broadcasts the message whatever path it came in through', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      const created = { id: 'msg-1', content: 'hello' };
      prisma.message.create.mockResolvedValue(created);

      await service.create(carrierId, tripId, 'hello');

      expect(broadcaster.emitNewMessage).toHaveBeenCalledWith(tripId, created);
    });

    it('does not broadcast a message it refused to persist', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);

      await expect(service.create('stranger', tripId, 'x')).rejects.toThrow(
        ForbiddenException,
      );

      expect(broadcaster.emitNewMessage).not.toHaveBeenCalled();
    });

    it('creates a message from the shipper to the carrier (receiver flips)', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.message.create.mockResolvedValue({ id: 'msg-2' });

      await service.create(shipperId, tripId, 'hi back');

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: shipperId,
            receiverId: carrierId,
          }),
        }),
      );
    });

    // El DTO cubre el POST, pero el gateway recibe el payload crudo: sin el
    // chequeo en el service entraba un mensaje vacío o de largo arbitrario, que
    // además viaja al cuerpo de la notificación push.
    it('rejects an empty or whitespace-only message', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);

      await expect(service.create(carrierId, tripId, '   ')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects a message past the length cap', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);

      await expect(
        service.create(carrierId, tripId, 'a'.repeat(2001)),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('stores the trimmed text, not the raw input', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });

      await service.create(carrierId, tripId, '  hola  ');

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'hola' }),
        }),
      );
    });

    it('throws NotFoundException when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      await expect(service.create(carrierId, tripId, 'x')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when sender is not a participant', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      await expect(service.create('stranger', tripId, 'x')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    // El gateway de sockets no valida JWT — toma el userId del handshake — así
    // que una cuenta eliminada seguía escribiendo en la room del viaje.
    it('throws ForbiddenException when the sender account is no longer active', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.user.findUnique.mockResolvedValue({ isActive: false });

      await expect(service.create(carrierId, tripId, 'x')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('push de mensajes nuevos', () => {
    it('notifies the receiver, not the sender', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.message.create.mockResolvedValue({
        id: 'm1',
        content: 'Llego en 20',
        sender: { id: carrierId, firstName: 'Carl', lastName: 'Driver' },
      });

      await service.create(carrierId, tripId, 'Llego en 20');

      expect(push.notify).toHaveBeenCalledWith(shipperId, {
        title: 'Carl Driver',
        body: 'Llego en 20',
        data: { tripId },
      });
    });

    it('falls back to a generic title when the sender is missing', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.message.create.mockResolvedValue({ id: 'm1', content: 'Hola' });

      await service.create(carrierId, tripId, 'Hola');

      expect(push.notify).toHaveBeenCalledWith(
        shipperId,
        expect.objectContaining({ title: 'Nuevo mensaje' }),
      );
    });

    it('still returns the message when notifying blows up', async () => {
      // El mensaje ya está persistido: avisar es best-effort y no puede tumbar
      // el envío.
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.message.create.mockResolvedValue({
        id: 'm1',
        content: 'Hola',
        sender: { id: carrierId, firstName: 'Carl', lastName: 'Driver' },
      });
      push.notify.mockRejectedValue(new Error('expo caido'));

      await expect(service.create(carrierId, tripId, 'Hola')).resolves.toMatchObject({
        id: 'm1',
      });
    });
  });

  describe('getTripMessages', () => {
    const carrierUser = { id: carrierId, role: 'TRANSPORTER' };

    it('validates participation for non-admin and returns reversed messages', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.message.findMany.mockResolvedValue([{ id: 'b' }, { id: 'a' }]);
      prisma.message.count.mockResolvedValue(2);

      const result = await service.getTripMessages(tripId, carrierUser);

      expect(prisma.trip.findUnique).toHaveBeenCalledWith({
        where: { id: tripId },
        include: { load: { select: { shipperId: true } } },
      });
      // findMany returns desc, service reverses to asc
      expect(result.messages).toEqual([{ id: 'a' }, { id: 'b' }]);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('throws ForbiddenException for a non-participant non-admin', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      await expect(
        service.getTripMessages(tripId, { id: 'stranger', role: 'TRANSPORTER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for non-admin when trip is missing', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      await expect(
        service.getTripMessages(tripId, carrierUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets an ADMIN view any trip without participation check', async () => {
      prisma.trip.findUnique.mockResolvedValue({ id: tripId });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      const result = await service.getTripMessages(tripId, {
        id: 'admin-1',
        role: 'ADMIN',
      });

      expect(prisma.trip.findUnique).toHaveBeenCalledWith({
        where: { id: tripId },
        select: { id: true },
      });
      expect(result.total).toBe(0);
    });

    it('throws NotFoundException for ADMIN when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      await expect(
        service.getTripMessages(tripId, { id: 'admin-1', role: 'ADMIN' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('applies pagination (page/limit) to skip/take', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      const result = await service.getTripMessages(tripId, carrierUser, 3, 10);

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
    });

    it('clamps invalid page/limit to a minimum of 1 (limit falls back to 50 when 0)', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      // page 0 -> Number(0)||1 -> 1; limit 0 -> Number(0)||1 -> 50
      const result = await service.getTripMessages(tripId, carrierUser, 0, 0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);

      // negative page clamps to 1 via Math.max
      const result2 = await service.getTripMessages(tripId, carrierUser, -5, -5);
      expect(result2.page).toBe(1);
      expect(result2.limit).toBe(1);
    });
  });

  describe('getConversationList', () => {
    it('returns conversations with other user, last message and unread counts', async () => {
      const trips = [
        {
          id: 'trip-a',
          carrierId,
          status: 'IN_PROGRESS',
          load: {
            title: 'Load A',
            shipperId,
            shipper: { id: shipperId, firstName: 'Ship', lastName: 'Per' },
          },
          carrier: { id: carrierId, firstName: 'Carr', lastName: 'Ier' },
          messages: [{ id: 'last-a' }],
        },
        {
          id: 'trip-b',
          carrierId: 'other-carrier',
          status: 'COMPLETED',
          load: {
            title: 'Load B',
            shipperId: carrierId, // current user is the shipper here
            shipper: { id: carrierId, firstName: 'Me', lastName: 'Shipper' },
          },
          carrier: { id: 'other-carrier', firstName: 'Oth', lastName: 'Er' },
          messages: [],
        },
      ];
      prisma.trip.findMany.mockResolvedValue(trips);
      prisma.message.groupBy.mockResolvedValue([{ tripId: 'trip-a', _count: 4 }]);

      const result = await service.getConversationList(carrierId);

      expect(result).toHaveLength(2);
      // trip-a: user is carrier -> otherUser is the shipper
      expect(result[0].otherUser).toEqual({
        id: shipperId,
        firstName: 'Ship',
        lastName: 'Per',
      });
      expect(result[0].lastMessage).toEqual({ id: 'last-a' });
      expect(result[0].unreadCount).toBe(4);
      // trip-b: user is shipper -> otherUser is the carrier; no messages -> null
      expect(result[1].otherUser).toEqual({
        id: 'other-carrier',
        firstName: 'Oth',
        lastName: 'Er',
      });
      expect(result[1].lastMessage).toBeNull();
      expect(result[1].unreadCount).toBe(0);
    });

    it('returns an empty array when there are no trips', async () => {
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.message.groupBy.mockResolvedValue([]);

      const result = await service.getConversationList(carrierId);
      expect(result).toEqual([]);
      expect(prisma.message.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tripId: { in: [] } }),
        }),
      );
    });
  });

  describe('getUnreadTotal', () => {
    it('returns the total unread message count for the user', async () => {
      prisma.message.count.mockResolvedValue(7);
      const result = await service.getUnreadTotal(carrierId);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: { receiverId: carrierId, isRead: false },
      });
      expect(result).toEqual({ unreadCount: 7 });
    });
  });

  describe('markAsRead', () => {
    it('validates participation then marks unread messages as read', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      prisma.message.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAsRead(tripId, carrierId);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { tripId, receiverId: carrierId, isRead: false },
        data: { isRead: true },
      });
      expect(result).toEqual({ count: 3 });
    });

    it('throws ForbiddenException when the user is not a participant', async () => {
      prisma.trip.findUnique.mockResolvedValue(baseTrip);
      await expect(service.markAsRead(tripId, 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the trip does not exist', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      await expect(service.markAsRead(tripId, carrierId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
