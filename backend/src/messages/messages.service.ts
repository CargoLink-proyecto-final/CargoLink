import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

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
    return trip;
  }

  async create(senderId: string, tripId: string, content: string) {
    const trip = await this.validateTripParticipant(tripId, senderId);
    const receiverId =
      trip.carrierId === senderId ? trip.load.shipperId : trip.carrierId;

    return this.prisma.message.create({
      data: { senderId, receiverId, tripId, content },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async getTripMessages(tripId: string, userId: string, page?: number, limit?: number) {
    await this.validateTripParticipant(tripId, userId);

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
