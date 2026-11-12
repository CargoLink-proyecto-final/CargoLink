import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../push/presence.service';
import { ChatBroadcaster } from './chat-broadcaster';
import { SocketAuthService, extractSocketToken } from '../auth/socket-auth.service';
import { parseCorsOrigins } from '../common/cors';

@WebSocketGateway({
  cors: {
    // Antes era `'*'`. Se evalúa por handshake (no al importar el módulo) para
    // que tome el CORS_ORIGIN ya cargado. Sin Origin = app mobile, que no es un
    // navegador y por lo tanto no aplica CORS; la autenticación va por token.
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(null, !origin || parseCorsOrigins().includes(origin)),
  },
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
    private socketAuth: SocketAuthService,
  ) {}

  /**
   * Le pasa el servidor al `ChatBroadcaster` para que los servicios de dominio
   * puedan difundir sin depender de este gateway (ver ChatBroadcaster).
   */
  afterInit(server: Server) {
    this.broadcaster.register(server);
  }

  async handleConnection(client: Socket) {
    // Antes el gateway confiaba en `handshake.query.userId`: cualquiera podía
    // conectarse con el id de otro y recibir sus chats y la ubicación de sus
    // viajes. Ahora la identidad sale exclusivamente del access token.
    const user = await this.socketAuth.authenticate(extractSocketToken(client.handshake));
    if (!user) {
      client.emit('unauthorized', { message: 'Sesión inválida o vencida' });
      client.disconnect(true);
      return;
    }
    const userId = user.id;
    client.data.userId = userId;

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
  async handleMessage(client: Socket, payload: { tripId: string; content: string }) {
    // El remitente es siempre el dueño del socket. El `senderId` que mandaba el
    // cliente se ignora: permitía escribir en nombre de cualquier usuario.
    const senderId = client.data?.userId as string | undefined;
    if (!senderId) throw new WsException('No autenticado');
    // El broadcast lo hace el service, para no emitir dos veces.
    return this.messagesService.create(senderId, payload?.tripId, payload?.content);
  }
}
