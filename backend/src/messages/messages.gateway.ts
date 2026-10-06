import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../push/presence.service';
import { ChatBroadcaster } from './chat-broadcaster';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class MessagesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  /** Dueño de cada socket, para descontarle la presencia al desconectarse. */
  private readonly userIdBySocket = new Map<string, string>();

  constructor(
    private messagesService: MessagesService,
    private prisma: PrismaService,
    private presence: PresenceService,
    private broadcaster: ChatBroadcaster,
  ) {}

  /**
   * Le pasa el servidor al `ChatBroadcaster` para que los servicios de dominio
   * puedan difundir sin depender de este gateway (ver ChatBroadcaster).
   */
  afterInit(server: Server) {
    this.broadcaster.register(server);
  }

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
    // El broadcast lo hace el service, para no emitir dos veces.
    return this.messagesService.create(
      payload.senderId,
      payload.tripId,
      payload.content,
    );
  }
}
