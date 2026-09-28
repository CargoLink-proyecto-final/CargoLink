import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * Puente entre los servicios de dominio y el servidor de Socket.IO.
 *
 * Existe para romper un ciclo: los mensajes se difunden desde
 * `MessagesService.create` —porque también entran por `POST /messages/trip/:id`,
 * que es como los manda el web, y ese camino no pasa por el socket— pero el
 * servidor de Socket.IO lo tiene el gateway, que a su vez necesita al service
 * para persistir. Inyectar el gateway en el service cierra el ciclo y `forwardRef`
 * no alcanza: la resolución se va en recursión y el proceso muere al arrancar.
 *
 * Con esto las dos flechas apuntan acá y no hay ciclo: el gateway registra su
 * servidor al inicializarse y el service sólo emite.
 */
@Injectable()
export class ChatBroadcaster {
  private readonly logger = new Logger(ChatBroadcaster.name);
  private server?: Server;

  /** La llama el gateway en `afterInit`, cuando el adapter ya levantó. */
  register(server: Server) {
    this.server = server;
  }

  /**
   * Difunde un mensaje a la room del viaje. Si el servidor todavía no está
   * registrado (arranque del proceso), loguea y sigue: un mensaje ya persistido
   * no puede fallar porque el socket no esté listo.
   */
  emitNewMessage(tripId: string, message: unknown) {
    if (!this.server) {
      this.logger.warn(
        `Socket.IO sin inicializar: el mensaje del viaje ${tripId} no se difundió en vivo`,
      );
      return;
    }
    this.server.to(`trip_${tripId}`).emit('newMessage', message);
  }
}
