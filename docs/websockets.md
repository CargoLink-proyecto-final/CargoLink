# WebSockets (chat en tiempo real)

El backend expone un único namespace de Socket.IO para mensajería del chat por trip. Source: [`../backend/src/messages/messages.gateway.ts`](../backend/src/messages/messages.gateway.ts).

## Resumen

| Aspecto | Valor |
|---|---|
| URL | `ws://localhost:3001/chat` (mismo host:port que la API REST) |
| Namespace | `/chat` |
| CORS | `origin: '*'` (sin restricción — TODO endurecer para prod, ver caveats abajo) |
| Auth | `userId` en la query del handshake; **no** JWT |
| Transport | Socket.IO default (websocket con fallback a long-polling) |

Las acciones de mensajería se duplican entre REST y WS: mandar por POST a `/api/messages/trip/:tripId` o emitir `sendMessage` por socket termina llamando al mismo `MessagesService.create()`. La diferencia es que el socket broadcastea inmediatamente a todos los clientes conectados al room del trip.

## Handshake / conexión

Cliente:

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001/chat', {
  query: { userId: '<userId-del-logueado>' },
});
```

Al conectar, el servidor ejecuta `handleConnection(client)`:

1. Lee `userId` del handshake. Si está vacío, **no hace nada** (el cliente queda conectado pero sin rooms).
2. Joinea `user_${userId}` (room personal).
3. Consulta a Prisma todos los trips donde el usuario es carrier **o** dueño del load del trip, con estado `ACCEPTED`, `IN_PROGRESS` o `COMPLETED`.
4. Joinea `trip_${tripId}` para cada uno.

Implementación:

```ts
async handleConnection(client: Socket) {
  const userId = client.handshake.query.userId as string;
  if (!userId) return;

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
  senderId: string;   // userId del que manda
  tripId: string;     // trip donde se envía
  content: string;    // texto
}
```

Handler (gateway):

```ts
@SubscribeMessage('sendMessage')
async handleMessage(client: Socket, payload: { senderId, tripId, content }) {
  const message = await this.messagesService.create(
    payload.senderId, payload.tripId, payload.content,
  );

  this.server.to(`trip_${payload.tripId}`).emit('newMessage', message);

  return message;
}
```

- Persiste vía `MessagesService.create()` (mismo flujo que el REST `POST /messages/trip/:tripId`).
- Broadcastea `newMessage` al room del trip — incluye al sender, así el cliente que mandó también recibe la confirmación con el ID generado.
- Devuelve el `message` al cliente que llamó vía ack/promise.

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

const { user } = useAuthStore.getState();
const socket = io(`${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '')}/chat`, {
  query: { userId: user!.id },
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
socket.emit('sendMessage', { senderId: user!.id, tripId, content });

// cleanup
return () => { socket.disconnect(); };
```

En mobile el patrón es idéntico — la dependencia `socket.io-client@4.7.4` está en ambos `package.json`.

## Cliente típico (mobile)

```ts
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const userId = await AsyncStorage.getItem('userId');
const socket = io('http://<tu-ip-lan>:3001/chat', {
  query: { userId },
});
```

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

- **CORS `origin: '*'`**: cualquier sitio puede abrir el socket. En producción ajustar `cors.origin` en el `@WebSocketGateway(...)` a la lista real de orígenes confiables, o leerlo de env.
- **Auth débil**: el `userId` viene en la query y se cree a ciegas. Cualquier cliente puede impersonar a otro usuario en el WS — la validación de "podés mandar a este trip" la hace `MessagesService.create()`, pero el `senderId` que se persiste es el que mandó el cliente. Para producción: pasar el JWT en `auth: { token: '...' }` y validar en `handleConnection` con la misma `JwtStrategy`.
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
