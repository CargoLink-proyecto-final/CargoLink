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
    // Hoy hay un solo gateway, así que esto no puede pasar. Si mañana aparece
    // otro en otro namespace y llama acá, el chat se redirigiría en silencio a
    // un namespace donde nadie escucha: mejor que quede en los logs.
    if (this.server) {
      this.logger.warn(
        'Ya había un servidor de Socket.IO registrado: el chat va a emitir contra el último',
      );
    }
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
    // Best-effort, igual que la push: quien llama ya persistió el mensaje, así
    // que un fallo del socket no puede convertir un envío exitoso en un 500.
    // El cliente lo recupera con su polling o al reconectar.
    try {
      this.server.to(`trip_${tripId}`).emit('newMessage', message);
    } catch (err) {
      this.logger.error(
        `No se pudo difundir el mensaje del viaje ${tripId}`,
        err as Error,
      );
    }
  }
}
