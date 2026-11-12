import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Formato de los tokens que emite Expo. Filtra basura antes de guardarla. */
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_PATTERN.test(token);
}

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  async registerToken(userId: string, token: string): Promise<void> {
    // Las dos escrituras van juntas: si la segunda fallara por separado, el
    // dueño anterior quedaría sin token y el nuevo tampoco lo tendría, así que
    // nadie recibiría las notificaciones de ese teléfono hasta el próximo login.
    await this.prisma.$transaction([
      // Un token sólo puede pertenecer a un usuario: si el dispositivo cambió de
      // sesión, el dueño anterior dejaría de recibir sus propias notificaciones
      // y pasaría a recibir las del nuevo en el mismo teléfono.
      this.prisma.user.updateMany({
        where: { expoPushToken: token, NOT: { id: userId } },
        data: { expoPushToken: null },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { expoPushToken: token },
      }),
    ]);
  }

  async clearToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: null },
    });
  }

  /**
   * Manda un push salvo que el usuario tenga la app abierta — en ese caso el
   * cliente ya se entera por el socket y muestra su propia notificación.
   */
  async notify(userId: string, message: PushMessage): Promise<void> {
    if (this.presence.isOnline(userId)) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });
    const token = user?.expoPushToken;
    if (!token) return;

    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: token,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: 'default',
        }),
      });

      if (!res.ok) {
        this.logger.warn(`Expo push respondió ${res.status} para el usuario ${userId}`);
        return;
      }

      // Expo responde 200 con el error adentro. Un token de un dispositivo que
      // desinstaló la app queda inservible: lo borramos para no reintentar en
      // cada mensaje.
      const payload = (await res.json()) as {
        data?: { status?: string; details?: { error?: string } };
      };
      if (payload?.data?.status === 'error') {
        const error = payload.data.details?.error;
        this.logger.warn(`Expo push falló para el usuario ${userId}: ${error ?? 'desconocido'}`);
        if (error === 'DeviceNotRegistered') {
          await this.clearToken(userId);
        }
      }
    } catch (err) {
      // Notificar es best-effort: que la Expo Push API esté caída no puede
      // tumbar el envío del mensaje, que ya está persistido.
      this.logger.error(`No se pudo mandar el push al usuario ${userId}`, err as Error);
    }
  }
}
