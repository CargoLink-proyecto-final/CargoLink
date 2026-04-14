import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private messagesService: MessagesService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (!userId) return;

    client.join(`user_${userId}`);

    // Join all trip rooms where the user is a participant
    const trips = await this.prisma.trip.findMany({
      where: {
        OR: [
          { carrierId: userId },
          { load: { shipperId: userId } },
        ],
        status: { in: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] },
      },
      select: { id: true },
    });

    for (const trip of trips) {
      client.join(`trip_${trip.id}`);
    }
  }

  handleDisconnect(_client: Socket) {
    // Socket.IO handles room cleanup automatically
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    client: Socket,
    payload: { senderId: string; tripId: string; content: string },
  ) {
    const message = await this.messagesService.create(
      payload.senderId,
      payload.tripId,
      payload.content,
    );

    this.server.to(`trip_${payload.tripId}`).emit('newMessage', message);

    return message;
  }
}
