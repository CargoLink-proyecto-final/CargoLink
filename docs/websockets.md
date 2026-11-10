# WebSockets (chat en tiempo real)

El backend expone un único namespace de Socket.IO para mensajería del chat por trip. Source: [`../backend/src/messages/messages.gateway.ts`](../backend/src/messages/messages.gateway.ts).

## Resumen

| Aspecto | Valor |
|---|---|
| URL | `ws://localhost:3001/chat` (mismo host:port que la API REST) |
| Namespace | `/chat` |
| CORS | Los orígenes de `CORS_ORIGIN` (mismo criterio que HTTP, [`common/cors.ts`](../backend/src/common/cors.ts)). Sin header `Origin` (app mobile) se acepta: no es un navegador |
| Auth | **Access token JWT** en `auth.token` del handshake (o header `Authorization: Bearer`). Sin token válido, el server desconecta |
| Transport | Socket.IO default (websocket con fallback a long-polling) |

Las acciones de mensajería se duplican entre REST y WS: mandar por POST a `/api/messages/trip/:tripId` o emitir `sendMessage` por socket termina llamando al mismo `MessagesService.create()`. La diferencia es que el socket broadcastea inmediatamente a todos los clientes conectados al room del trip.

## Handshake / conexión

Cliente:

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001/chat', {
  // Función y no objeto: cada reconexión lee el token vigente (el access token
  // dura 15 min y el cliente HTTP lo renueva por detrás).
  auth: (cb) => cb({ token: getAccessToken() }),
});
```

Al conectar, el servidor ejecuta `handleConnection(client)`:

1. Valida el access token con `SocketAuthService` ([`../backend/src/auth/socket-auth.service.ts`](../backend/src/auth/socket-auth.service.ts)): firma, vencimiento y usuario existente y activo (mismo criterio que `JwtStrategy`). Si no pasa, emite `unauthorized` y **desconecta**.
2. Guarda el `userId` del token en `client.data.userId` y joinea `user_${userId}` (room personal).
3. Consulta a Prisma todos los trips donde el usuario es carrier **o** dueño del load del trip, con estado `ACCEPTED`, `IN_PROGRESS` o `COMPLETED`.
4. Joinea `trip_${tripId}` para cada uno.

Implementación:

```ts
async handleConnection(client: Socket) {
  const user = await this.socketAuth.authenticate(extractSocketToken(client.handshake));
  if (!user) {
    client.emit('unauthorized', { message: 'Sesión inválida o vencida' });
    client.disconnect(true);
    return;
  }
  const userId = user.id;
  client.data.userId = userId;

  client.join(`user_${userId}`);

  const trips = await this.prisma.trip.findMany({
    where: {
      OR: [{ carrierId: userId }, { load: { shipperId: userId } }],
      status: { in: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] },
    },
    select: { id: true },
  });

  for (const trip of trips) {
    client.join(`trip_${trip.id}`);
  }
}
```

## Rooms

| Room | Propósito |
|---|---|
| `user_${userId}` | Notificaciones dirigidas a un usuario específico (placeholder — hoy el código no emite a este room, pero queda reservado). |
| `trip_${tripId}` | Broadcast de mensajes de un trip. Cada participante del trip está en este room. |

Notar: si un trip pasa a `ACCEPTED` **después** de que el cliente ya está conectado, el nuevo room no se auto-joinea — el cliente tiene que reconectarse o vos hacer un `socket.emit('joinTrip', tripId)` (que no existe hoy; sería un nice-to-have).

## Eventos

### `sendMessage` (cliente → servidor)

Payload:

```ts
{
  tripId: string;     // trip donde se envía
  content: string;    // texto
}
```

El remitente **no** viaja en el payload: es siempre el dueño del socket (`client.data.userId`). Un `senderId` que mande el cliente se ignora.

Handler (gateway):

```ts
@SubscribeMessage('sendMessage')
async handleMessage(client: Socket, payload: { tripId: string; content: string }) {
  const senderId = client.data?.userId;
  if (!senderId) throw new WsException('No autenticado');
  // El broadcast lo hace el service, para no emitir dos veces.
  return this.messagesService.create(senderId, payload?.tripId, payload?.content);
}
```

- Persiste vía `MessagesService.create()` (mismo flujo que el REST `POST /messages/trip/:tripId`).
- Devuelve el `message` al cliente que llamó vía ack/promise.

**Quién emite `newMessage`.** No el gateway: lo hace `MessagesService.create()` a
través de `ChatBroadcaster`. La razón es que los mensajes entran por dos caminos
—este evento y el `POST /messages/trip/:tripId` que usa el web— y emitir desde el
handler difundía sólo los del socket: un mensaje escrito desde el web no llegaba
en vivo a la app, que apaga su polling justamente cuando el socket está vivo.

`ChatBroadcaster` existe para romper el ciclo: el service necesita emitir y el
servidor de Socket.IO lo tiene el gateway, que a su vez necesita al service para
persistir. Inyectar el gateway en el service cierra el ciclo y **`forwardRef` no
alcanza** — la resolución se va en recursión y el proceso muere al arrancar. Con
el broadcaster, el gateway le registra su `Server` en `afterInit` y el service
sólo emite. `messages.module.spec.ts` compila el módulo con el contenedor de Nest
para que ese ciclo no vuelva a pasar inadvertido.

El broadcast incluye al sender, así el cliente que mandó también recibe la
confirmación con el ID generado.

### `newMessage` (servidor → cliente)

Payload (objeto Message completo):

```jsonc
{
  "id": "msg-uuid",
  "tripId": "trip-uuid",
  "senderId": "user-uuid",
  "receiverId": "user-uuid",
  "content": "Estoy llegando",
  "isRead": false,
  "createdAt": "2026-05-23T12:34:56Z",
  "sender": {
    "id": "user-uuid",
    "firstName": "Juan",
    "lastName": "García"
    // ...
  }
}
```

## Cliente típico (web)

```ts
import { io } from 'socket.io-client';
import { useAuthStore } from '@/store/auth';

const socket = io(`${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '')}/chat`, {
  auth: (cb) => cb({ token: sessionStorage.getItem('token') }),
});

// suscribirse a mensajes entrantes
socket.on('newMessage', (msg) => {
  if (msg.tripId === currentTripId) {
    // append al estado del chat
  } else {
    // incrementar badge de no leídos
  }
});

// mandar
socket.emit('sendMessage', { tripId, content });

// cleanup
return () => { socket.disconnect(); };
```

En mobile el patrón es idéntico — la dependencia `socket.io-client@4.7.4` está en ambos `package.json`.

## Cliente típico (mobile)

```ts
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const socket = io('http://<tu-ip-lan>:3001/chat', {
  transports: ['websocket'],
  auth: (cb) => {
    AsyncStorage.getItem('token').then((token) => cb({ token }));
  },
});
```

Implementación real: [`../mobile/src/services/socket.ts`](../mobile/src/services/socket.ts).

Nota: `localhost` desde un dispositivo físico apunta al dispositivo, no a tu máquina. Usar la IP LAN o un túnel (ngrok / Cloudflare tunnel).

## Consistencia DB ↔ socket

Toda escritura de mensajes pasa por `MessagesService.create()`:

```
cliente
  ├─ HTTP POST /api/messages/trip/:tripId  ─┐
  │                                          │
  └─ WS emit('sendMessage')   ───────────────┤
                                             ▼
                                  MessagesService.create()
                                             │
                                             ├─ valida participante
                                             ├─ infiere receiverId
                                             ├─ prisma.message.create()
                                             └─ devuelve el mensaje
```

Cuando el origen es WS, el gateway broadcastea `newMessage` después de la persistencia. Cuando el origen es REST, **no hay broadcast** (el endpoint solo devuelve el mensaje creado al solicitante). Si querés que un POST también dispare el broadcast, tendrías que inyectar el `MessagesGateway` en `MessagesController` y emitir desde ahí. Hoy no se hace porque la UI usa WS para mensajería interactiva y el REST como fallback / para historial.

## Marcar como leído

No hay evento WS para esto. Se hace por REST con `PATCH /api/messages/trip/:tripId/read`. Si querés que la contraparte vea el "read receipt" en tiempo real, hay que sumar un evento (`messagesRead`) que el handler `markAsRead` también emita.

## Caveats

- **Token vencido con el socket abierto**: el token se valida en el handshake; un socket ya conectado sigue vivo aunque el access token venza. Al reconectar se pide uno vigente. Una cuenta desactivada deja de poder conectarse, pero un socket abierto no se corta solo.
- **Sin reconnect handling de rooms**: si la conexión cae y vuelve, los `client.join(...)` se re-ejecutan en `handleConnection`, pero un trip creado durante la caída no aparece (la lista se computa al momento). En la práctica funciona porque la conexión es resiliente, pero si la UI cambia de trip "activo" mientras está conectada, no es necesariamente trivial.
- **Sin rate limiting**: no hay throttling de `sendMessage`. Un cliente malicioso podría llenar la DB con mensajes — `MessagesService` solo valida participación.
- **Sin ack a nivel UI**: el ack que devuelve el `@SubscribeMessage` handler está disponible (`socket.emit('sendMessage', payload, ack => ...)`), pero el código frontend hoy no lo usa para nada — se asume que `newMessage` llega.

## Para sumar un evento nuevo

Ejemplo: emitir `tripStatusChanged` cuando un trip pasa a `IN_PROGRESS`.

1. Inyectar `MessagesGateway` en `TripsService` (cuidado con dependencias circulares — `MessagesGateway` ya inyecta `MessagesService`; mejor mover el gateway a un módulo neutro o crear un `EventsGateway` aparte).
2. En el método que cambia el estado:
   ```ts
   this.gateway.server.to(`trip_${tripId}`).emit('tripStatusChanged', { tripId, status: 'IN_PROGRESS' });
   ```
3. En el cliente: `socket.on('tripStatusChanged', payload => ...)`.

Si el evento no es por-trip sino por-usuario (p.ej. "tenés un mensaje nuevo en otro trip"), emitir a `user_${userId}` en vez de `trip_${tripId}`.
