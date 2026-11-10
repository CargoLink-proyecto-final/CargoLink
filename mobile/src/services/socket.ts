import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOCKET_URL } from '../config/env';
import { refreshSession } from './api';

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
// Como mucho un intento de re-autenticación por minuto. No alcanza con resetearlo
// en `connect`: el gateway acepta el handshake y recién después desconecta, así
// que `connect` se dispara aunque el token sea rechazado, y eso sería un loop.
const REAUTH_COOLDOWN_MS = 60_000;
let lastReauthAt = 0;

/**
 * El server corta la conexión (`io server disconnect`) cuando el access token
 * del handshake no es válido, típicamente porque venció mientras la app estaba
 * en segundo plano sin hacer requests HTTP (que son las que lo renuevan). Ante
 * un corte del server socket.io NO reconecta solo: renovamos la sesión y
 * reconectamos a mano. Si la sesión murió, no hay nada que reconectar (el store
 * ya hace logout vía el interceptor de axios).
 */
async function reauthenticate(target: Socket): Promise<void> {
  if (Date.now() - lastReauthAt < REAUTH_COOLDOWN_MS) return;
  lastReauthAt = Date.now();
  try {
    const session = await refreshSession();
    // Puede haber cambiado de usuario o cerrado sesión mientras tanto.
    if (session && target === socket) target.connect();
  } catch {
    // Sin red: el próximo getChatSocket() vuelve a intentar conectar.
  }
}

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
  lastReauthAt = 0;

  const created = socket;
  created.on('disconnect', (reason: string) => {
    if (reason === 'io server disconnect') void reauthenticate(created);
  });

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
