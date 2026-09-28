import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { ChatBroadcaster } from './chat-broadcaster';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private broadcaster: ChatBroadcaster,
  ) {}

  private async validateTripParticipant(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: { select: { shipperId: true } } },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    const isCarrier = trip.carrierId === userId;
    const isShipper = trip.load.shipperId === userId;
    if (!isCarrier && !isShipper) {
      throw new ForbiddenException('No eres participante de este viaje');
    }
    // El gateway de WebSockets no valida JWT: toma el userId del handshake. Sin
    // este chequeo, una cuenta dada de baja o desactivada seguía entrando a la
    // room del viaje y escribiendo mensajes, porque el corte de sesión vive en
    // la estrategia de JWT y el socket no pasa por ahí.
    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    if (!sender?.isActive) {
      throw new ForbiddenException('La cuenta no está activa');
    }
    return trip;
  }

  async create(senderId: string, tripId: string, content: string) {
    const trip = await this.validateTripParticipant(tripId, senderId);
    const receiverId =
      trip.carrierId === senderId ? trip.load.shipperId : trip.carrierId;

    const message = await this.prisma.message.create({
      data: { senderId, receiverId, tripId, content },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Difusión en vivo a quien tenga la conversación abierta. Va acá por lo
    // mismo que la push: los mensajes del web entran por REST y no pasan por el
    // gateway, así que emitir desde el handler del socket dejaba la conversación
    // congelada del otro lado.
    this.broadcaster.emitNewMessage(tripId, message);

    // Acá y no en el gateway porque los mensajes también entran por REST, que no
    // pasa por el socket. `notify` se saltea solo a quien tiene la app abierta.
    // No se espera: el mensaje ya está guardado y avisar es best-effort.
    // El nombre sale del include, pero se degrada en vez de romper: notificar no
    // puede tumbar el envío de un mensaje que ya está persistido.
    const senderName = message.sender
      ? `${message.sender.firstName} ${message.sender.lastName}`.trim()
      : 'Nuevo mensaje';

    // El `.catch` va acá aunque `notify` ya maneje sus errores: sin él, una
    // rejection inesperada queda sin handler y en Node tumba el proceso.
    void this.push
      .notify(receiverId, {
        title: senderName || 'Nuevo mensaje',
        body: content,
        data: { tripId },
      })
      .catch(() => undefined);

    return message;
  }

  async getTripMessages(
    tripId: string,
    user: { id: string; role: string },
    page?: number,
    limit?: number,
  ) {
    if (user.role !== 'ADMIN') {
      await this.validateTripParticipant(tripId, user.id);
    } else {
      const exists = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Viaje no encontrado');
    }

    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Number(limit) || 50);

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { tripId },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
      this.prisma.message.count({ where: { tripId } }),
    ]);

    return { messages: messages.reverse(), total, page: p, limit: l };
  }

  async getConversationList(userId: string) {
    const trips = await this.prisma.trip.findMany({
      where: {
        OR: [
          { carrierId: userId },
          { load: { shipperId: userId } },
        ],
        status: { in: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] },
      },
      include: {
        load: {
          select: {
            title: true,
            shipperId: true,
            shipper: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        carrier: { select: { id: true, firstName: true, lastName: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const tripIds = trips.map((t) => t.id);
    const unreadCounts = await this.prisma.message.groupBy({
      by: ['tripId'],
      where: { tripId: { in: tripIds }, receiverId: userId, isRead: false },
      _count: true,
    });
    const unreadMap = new Map(unreadCounts.map((u) => [u.tripId, u._count]));

    return trips.map((trip) => {
      const otherUser =
        trip.carrierId === userId ? trip.load.shipper : trip.carrier;
      const lastMessage = trip.messages[0] || null;
      return {
        tripId: trip.id,
        tripStatus: trip.status,
        loadTitle: trip.load.title,
        otherUser,
        lastMessage,
        unreadCount: unreadMap.get(trip.id) || 0,
      };
    });
  }

  async getUnreadTotal(userId: string) {
    const count = await this.prisma.message.count({
      where: { receiverId: userId, isRead: false },
    });
    return { unreadCount: count };
  }

  async markAsRead(tripId: string, userId: string) {
    await this.validateTripParticipant(tripId, userId);
    return this.prisma.message.updateMany({
      where: { tripId, receiverId: userId, isRead: false },
      data: { isRead: true },
    });
  }
}
