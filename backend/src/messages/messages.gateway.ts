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
import { PresenceService } from '../push/presence.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  /** Dueño de cada socket, para descontarle la presencia al desconectarse. */
  private readonly userIdBySocket = new Map<string, string>();

  constructor(
    private messagesService: MessagesService,
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (!userId) return;

    // `handleDisconnect` ya no tiene el handshake a mano, así que hay que
    // recordar de quién era el socket para descontarle la presencia.
    this.userIdBySocket.set(client.id, userId);
    this.presence.connect(userId);

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

  handleDisconnect(client: Socket) {
    // Socket.IO limpia las rooms solo; lo que hay que descontar es la presencia,
    // que decide si al usuario le mandamos push o no.
    const userId = this.userIdBySocket.get(client.id);
    if (!userId) return;
    this.userIdBySocket.delete(client.id);
    this.presence.disconnect(userId);
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
