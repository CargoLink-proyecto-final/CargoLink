import { useEffect } from 'react';
import { getChatSocket } from '../services/socket';
import { getActiveTripId } from '../services/activeChat';
import {
  registerForPushNotifications,
  scheduleLocalNotification,
} from '../services/notifications';
import { usersApi } from '../services/api';
import { Message } from '../types';

/**
 * Avisa de los mensajes que llegan mientras la app está abierta.
 *
 * Dos piezas distintas:
 *
 * 1. **Notificación local** por cada mensaje entrante de una conversación que
 *    NO es la que el usuario tiene abierta. Esto funciona hoy, sin cuenta EAS
 *    ni backend: la dispara el propio dispositivo al recibir el evento del
 *    socket.
 * 2. **Registro del push token** — para notificaciones con la app cerrada.
 *    Devuelve null mientras no exista un projectId de EAS. Además el backend
 *    todavía no tiene dónde guardar el token ni desde dónde emitir pushes, así
 *    que por ahora sólo lo dejamos pedido y logueado.
 */
export function useMessageNotifications(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    registerForPushNotifications()
      .then((token) => {
        // Devuelve null sin projectId de EAS y en el simulador: en esos casos no
        // hay nada que registrar y no es un error.
        if (!token) return;
        return usersApi.registerPushToken(token);
      })
      .catch((err) => {
        // Sin push remotas la app funciona igual: las locales salen del socket.
        console.warn('No se pudo registrar el push token', err);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const socket = getChatSocket(userId);

    const onNewMessage = (message: Message) => {
      // Los propios no se notifican, y tampoco los de la conversación abierta:
      // ahí el mensaje ya aparece en pantalla.
      if (message.senderId === userId) return;
      if (message.tripId === getActiveTripId()) return;

      const sender = message.sender
        ? `${message.sender.firstName} ${message.sender.lastName}`
        : 'Nuevo mensaje';
      scheduleLocalNotification(sender, message.content);
    };

    socket.on('newMessage', onNewMessage);
    return () => {
      socket.off('newMessage', onNewMessage);
    };
  }, [userId]);
}
