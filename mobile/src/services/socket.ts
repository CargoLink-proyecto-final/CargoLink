import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOCKET_URL } from '../config/env';

/**
 * Cliente del gateway de chat (`namespace /chat` de MessagesGateway).
 *
 * El gateway autentica con el access token que viaja en `auth.token` (ya no
 * confía en un `userId` mandado por el cliente) y, en `handleConnection`, mete
 * al socket en una room por cada viaje donde el usuario participa. Es decir:
 * el join a las rooms lo hace el server, el cliente sólo escucha `newMessage`.
 *
 * `auth` es una función para que cada reconexión lea el token vigente: el access
 * token dura poco y el interceptor de axios lo renueva por detrás.
 *
 * Singleton por usuario: todas las pantallas comparten la misma conexión. Si cambia
 * el userId (logout + login con otra cuenta) se descarta la anterior, porque las
 * rooms del socket viejo son las del usuario viejo.
 */
let socket: Socket | null = null;
let currentUserId: string | null = null;

export function getChatSocket(userId: string): Socket {
  if (socket && currentUserId === userId) {
    // Puede haberse caído por red; connect() sobre un socket ya conectado es no-op.
    if (!socket.connected) socket.connect();
    return socket;
  }

  disconnectChatSocket();

  socket = io(`${SOCKET_URL}/chat`, {
    // Sin este transport explícito socket.io arranca por long-polling, que en
    // React Native depende del XHR del runtime y falla seguido en red de LAN.
    transports: ['websocket'],
    auth: (cb: (data: { token: string | null }) => void) => {
      AsyncStorage.getItem('token')
        .then((token) => cb({ token }))
        .catch(() => cb({ token: null }));
    },
    reconnection: true,
    reconnectionDelay: 1000,
    // Cap para que la espera entre reintentos no crezca sin techo si el backend
    // está caído mientras la app queda abierta.
    reconnectionDelayMax: 5000,
    autoConnect: true,
  });
  currentUserId = userId;

  return socket;
}

export function disconnectChatSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  currentUserId = null;
}
