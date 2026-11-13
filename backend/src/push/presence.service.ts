import { Injectable } from '@nestjs/common';

/**
 * Quién tiene la app abierta con el socket de chat conectado.
 *
 * Existe para decidir si vale la pena mandar un push remoto: el cliente ya
 * dispara una notificación local cuando recibe un mensaje por el socket, así que
 * emitir además un push le duplicaría el aviso al usuario.
 *
 * Cuenta conexiones y no un booleano porque un mismo usuario puede tener más de
 * un socket vivo (varias pantallas reconectando, o dos dispositivos): si
 * guardáramos un flag, la primera desconexión lo daría por offline mientras
 * sigue mirando la app.
 *
 * Es memoria del proceso: con más de una instancia del backend cada una ve sólo
 * sus propias conexiones, y el peor caso es un push de más. Compartirlo
 * requeriría Redis.
 */
@Injectable()
export class PresenceService {
  private readonly connectionsByUser = new Map<string, number>();

  connect(userId: string): void {
    this.connectionsByUser.set(userId, (this.connectionsByUser.get(userId) ?? 0) + 1);
  }

  disconnect(userId: string): void {
    const current = this.connectionsByUser.get(userId);
    if (current == null) return;
    if (current <= 1) {
      this.connectionsByUser.delete(userId);
      return;
    }
    this.connectionsByUser.set(userId, current - 1);
  }

  isOnline(userId: string): boolean {
    return (this.connectionsByUser.get(userId) ?? 0) > 0;
  }

  /** Totales para el monitoreo del sistema (solo este proceso). */
  stats(): { onlineUsers: number; connections: number } {
    let connections = 0;
    for (const count of this.connectionsByUser.values()) connections += count;
    return { onlineUsers: this.connectionsByUser.size, connections };
  }
}
