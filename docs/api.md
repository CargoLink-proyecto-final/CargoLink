# API REST

Referencia completa de los endpoints HTTP del backend. Todo lo de tiempo real (chat) va por Socket.IO y está documentado en [`websockets.md`](./websockets.md).

> **Swagger UI**: la versión interactiva está siempre disponible en http://localhost:3001/api/docs cuando el stack está corriendo. Esta página es la copia legible y comentada.

## Convenciones

- **Base URL**: `http://localhost:3001/api` (dev local + Docker). En producción se configura por `NEXT_PUBLIC_API_URL` (frontend) o el cliente HTTP que uses.
- **Auth**: header `Authorization: Bearer <jwt>`. Lo obtenés con `POST /auth/login`. Detalle del flujo en [`autenticacion.md`](./autenticacion.md).
- **Content-Type**: `application/json` salvo el export de registro que devuelve `application/zip`.
- **Validación de input**: `class-validator` con `whitelist + forbidNonWhitelisted`. Campos extra fallan con 400.
- **Formato de error**: `{ statusCode, message, timestamp }`. Los errores semánticos (Forbidden, NotFound, BadRequest) traen el código HTTP correcto.
- **Paginación**: query params `page` (1-indexed) y `limit`. Defaults definidos en cada service.
- **Roles**: ver [`arquitectura.md`](./arquitectura.md). Los valores del enum son `CARGO_GENERATOR`, `TRANSPORTER`, `ADMIN`.

## Auth

Source: [`../backend/src/auth/auth.controller.ts`](../backend/src/auth/auth.controller.ts).

| Método | Path | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/register` | público | Crear cuenta + mandar email de verificación |
| POST | `/auth/login` | público | Devolver JWT (sólo si `emailVerified=true`) |
| GET | `/auth/verify-email/:token` | público | Verificar email con el token recibido |
| POST | `/auth/resend-verification` | público | Reenviar email de verificación |
| POST | `/auth/forgot-password` | público | Pedir email con reset link |
| POST | `/auth/reset-password` | público | Setear nuevo password con el token |

### POST `/auth/register`

```jsonc
// Body
{
  "email": "john@example.com",
  "password": "StrongPass123",       // mín. 6 chars
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",            // obligatorio
  "role": "CARGO_GENERATOR",         // | "TRANSPORTER" | "ADMIN"
  "companyName": "Acme Logistics"    // opcional
}

// 201 Created
{
  "id": "uuid",
  "email": "john@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "CARGO_GENERATOR",
  "emailVerified": false,
  "createdAt": "2026-05-23T..."
}
```

Manda email de verificación automáticamente. Hasta verificar, `POST /auth/login` falla.

### POST `/auth/login`

```jsonc
// Body
{ "email": "john@example.com", "password": "StrongPass123" }

// 200 OK
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "CARGO_GENERATOR"
  }
}
```

Errores:
- `401 Unauthorized` — credenciales inválidas.
- `403 Forbidden` con `code: "EMAIL_NOT_VERIFIED"` — la cuenta existe pero no verificó email.

### GET `/auth/verify-email/:token`

Acepta el token del link enviado por mail. Marca `emailVerified=true` y devuelve 200 o un error semántico si el token expiró / no existe.

### POST `/auth/resend-verification`

```jsonc
{ "email": "john@example.com" }
```

Regenera el token y reenvía el email (siempre que la cuenta exista y no esté verificada).

### POST `/auth/forgot-password`

```jsonc
{ "email": "john@example.com" }
```

Genera un `resetToken` con vencimiento de 1h y envía email con link a `${FRONTEND_URL}/auth/reset-password?token=<token>`. Responde 200 incluso si el email no existe (para no leakear).

### POST `/auth/reset-password`

```jsonc
{ "token": "<token-del-email>", "newPassword": "NewStrongPass456" }
```

Valida token + expiración, hashea el password y limpia los campos de reset.

## Users

Source: [`../backend/src/users/users.controller.ts`](../backend/src/users/users.controller.ts). Todos requieren JWT.

| Método | Path | Roles | Descripción |
|---|---|---|---|
| GET | `/users/me` | cualquier rol | Perfil propio |
| PATCH | `/users/me` | cualquier rol | Actualizar perfil propio (firstName, lastName, phone, companyName) |
| GET | `/users` | `ADMIN` | Listar todos con filtros `role`, `page`, `limit` |
| GET | `/users/:id` | cualquier rol | Detalle por ID |
| PATCH | `/users/:id/toggle-active` | `ADMIN` | Toggle `isActive` |

### PATCH `/users/me`

```jsonc
{
  "firstName": "...",       // todos opcionales
  "lastName": "...",
  "phone": "...",
  "companyName": "..."
}
```

## Loads

Source: [`../backend/src/loads/loads.controller.ts`](../backend/src/loads/loads.controller.ts). Todos requieren JWT.

| Método | Path | Roles | Descripción |
|---|---|---|---|
| POST | `/loads` | `CARGO_GENERATOR` | Crear load |
| GET | `/loads` | cualquier rol | Listar con filtros |
| GET | `/loads/available` | cualquier rol | Listar `PUBLISHED` (filtros) |
| GET | `/loads/my` | `CARGO_GENERATOR` | Loads propios |
| GET | `/loads/register` | cualquier rol | Registro de loads `DELIVERED`/`CANCELLED` (filtrado por rol) |
| GET | `/loads/register/export` | cualquier rol | ZIP con `loads.csv` + `messages.csv` |
| GET | `/loads/:id` | cualquier rol | Detalle |
| PATCH | `/loads/:id` | `CARGO_GENERATOR` | Actualizar (dueño) |
| DELETE | `/loads/:id` | `CARGO_GENERATOR` | Cancelar (dueño) |

### POST `/loads`

```jsonc
{
  "title": "Electronics to Córdoba",
  "description": "Fragile, handle with care",   // opcional
  "originAddress": "Av. Corrientes 1234, CABA",
  "originLat": -34.6037,
  "originLng": -58.3816,
  "destAddress": "Av. San Martín 567, Córdoba",
  "destLat": -31.4201,
  "destLng": -64.1888,
  "cargoType": "Electronics",
  "weight": 5000,                               // kg
  "volume": 12.5,                               // m³, opcional
  "pickupDate": "2026-06-01T08:00:00Z",
  "deliveryDate": "2026-06-03T18:00:00Z",       // opcional
  "price": 250000                                // moneda local (no se trackea currency)
}
```

Response 201 con el load creado, status `PUBLISHED` por defecto, `shipperId` autoseteado al usuario logueado.

### GET `/loads`, `/loads/available`, `/loads/my` — query params

```
?status=PUBLISHED|ASSIGNED|IN_TRANSIT|DELIVERED|CANCELLED
?cargoType=Electronics
?q=buenos+aires            # busca en title/description/origin/dest
?minWeight=1000&maxWeight=10000
?minPrice=50000&maxPrice=500000
?createdFrom=2026-01-01&createdTo=2026-12-31
?pickupFrom=...&pickupTo=...
?deliveryFrom=...&deliveryTo=...
?page=1&limit=50
```

`/loads/available` fuerza `status=PUBLISHED`. `/loads/my` filtra por shipper logueado.

Response:

```jsonc
{
  "data": [ /* loads */ ],
  "total": 123,
  "page": 1,
  "limit": 50
}
```

### GET `/loads/register`

Lista loads cerrados (`DELIVERED` o `CANCELLED`) según rol:
- `ADMIN` ve todos.
- `CARGO_GENERATOR` ve los suyos.
- `TRANSPORTER` ve los que llevó (los que tienen Trip suyo).

Query params: filtros por fecha, paginación.

### GET `/loads/register/export`

Mismo filtrado que `/register` pero responde con `application/zip` (header `Content-Disposition: attachment; filename="registro-cargas-YYYY-MM-DD.zip"`). Adentro:

- `loads.csv` — 30 columnas: `load_id, title, status, cargo_type, weight_kg, volume_m3, price, origin_address, origin_lat, origin_lng, dest_address, dest_lat, dest_lng, pickup_date, delivery_date_expected, shipper_id, shipper_name, shipper_email, shipper_phone, trip_id, trip_status, started_at, completed_at, trip_notes, carrier_id, carrier_name, carrier_email, carrier_phone, message_count, created_at, updated_at`.
- `messages.csv` — 9 columnas: `message_id, trip_id, load_id, load_title, sender_id, sender_name, content, is_read, created_at`.

Escapado CSV con comillas dobles para celdas con `,`, `"` o newlines.

### PATCH `/loads/:id`

```jsonc
{
  // todos opcionales — solo se actualizan los enviados
  "title": "...",
  "description": "...",
  "originAddress": "...", "originLat": -34, "originLng": -58,
  "destAddress": "...", "destLat": -31, "destLng": -64,
  "cargoType": "...",
  "weight": 5000, "volume": 12.5,
  "pickupDate": "...", "deliveryDate": "...",
  "price": 250000
}
```

Solo el shipper dueño puede actualizar. Si el load ya tiene Trip asignado, suele estar restringido (ver `loads.service.ts`).

### DELETE `/loads/:id`

Cancela (no borra). Pone `status=CANCELLED`. Solo el shipper dueño.

## Postulations

Source: [`../backend/src/postulations/postulations.controller.ts`](../backend/src/postulations/postulations.controller.ts). Todos requieren JWT.

| Método | Path | Roles | Descripción |
|---|---|---|---|
| POST | `/loads/:loadId/postulations` | `TRANSPORTER` | Postularse a un load |
| GET | `/loads/:loadId/postulations` | dueño del load o `ADMIN` | Listar postulaciones del load |
| GET | `/postulations/my` | `TRANSPORTER` | Mis postulaciones (filtro `?status=`) |
| POST | `/postulations/:id/accept` | `CARGO_GENERATOR` | Aceptar y crear trip |
| POST | `/postulations/:id/counter-offer` | `CARGO_GENERATOR` o `TRANSPORTER` | Contraoferta de precio |
| POST | `/postulations/:id/accept-offer` | `TRANSPORTER` | Aceptar contraoferta del shipper |
| DELETE | `/postulations/:id` | `TRANSPORTER` | Retirar postulación |

### POST `/loads/:loadId/postulations`

```jsonc
{
  "message": "Tengo camión refrigerado disponible para mañana",  // opcional, max 500
  "proposedPrice": 145000                                         // opcional, > 0
}
```

Si `proposedPrice` se envía y es <= `load.price`, falla con 400 (regla: el carrier ofrece subir el precio si quiere atraer; la baja se negocia por counter-offer).

Crea postulación con `status=PENDING`. La unique compuesta `(loadId, transporterId)` previene duplicados.

### GET `/loads/:loadId/postulations`

Devuelve array de postulations del load. Solo el shipper dueño o admin pueden verlas.

### GET `/postulations/my?status=PENDING|NEGOTIATING|ACCEPTED|REJECTED|WITHDRAWN`

Lista postulations del carrier logueado, filtrable por status.

### POST `/postulations/:id/accept`

Sin body. El shipper acepta. Efectos:
1. Postulation → `ACCEPTED`.
2. Se crea un `Trip` con `status=PENDING`, `carrierId=transporterId`.
3. El `Load` cambia a `status=ASSIGNED`.
4. Otras postulaciones del mismo load se marcan como `REJECTED`.

### POST `/postulations/:id/counter-offer`

```jsonc
{ "price": 165000 }    // positivo
```

Cualquiera de las dos partes puede mandarlo. Setea `counterOfferPrice` y `lastOfferBy=user.id`, pasa `status=NEGOTIATING`.

### POST `/postulations/:id/accept-offer`

El transporter acepta la contraoferta vigente. Equivale al flujo de `accept` pero usando `counterOfferPrice` como precio final del trip.

### DELETE `/postulations/:id`

El transporter retira. Postulation → `WITHDRAWN`. No libera la unique compuesta — el mismo carrier no puede volver a postularse al mismo load.

## Trips

Source: [`../backend/src/trips/trips.controller.ts`](../backend/src/trips/trips.controller.ts). Todos requieren JWT.

| Método | Path | Roles | Descripción |
|---|---|---|---|
| POST | `/trips/accept/:loadId` | `ADMIN` | Override: crea trip sin postulación |
| GET | `/trips` | `ADMIN` | Listar todos los trips |
| GET | `/trips/my` | `TRANSPORTER` | Trips propios (carrier) |
| GET | `/trips/my-loads` | `CARGO_GENERATOR` | Trips de mis loads (shipper) |
| GET | `/trips/:id` | cualquier rol | Detalle |
| PATCH | `/trips/:id/start` | `TRANSPORTER` (dueño) | `PENDING` → `IN_PROGRESS`, set `startedAt` |
| PATCH | `/trips/:id/complete` | `TRANSPORTER` (dueño) | → `COMPLETED`, set `completedAt`, load → `DELIVERED` |
| PATCH | `/trips/:id/location` | `TRANSPORTER` (dueño) | Update `currentLat`/`currentLng` |

### Query params en GET

`/trips`, `/trips/my` y `/trips/my-loads` aceptan `?status=...&page=...&limit=...`.

### PATCH `/trips/:id/location`

```jsonc
{ "lat": -34.6037, "lng": -58.3816 }
```

Sin validación de DTO formal — sólo se setea si el carrier es dueño del trip. El frontend mobile típicamente lo invoca cada 30s mientras el trip está `IN_PROGRESS`.

## Messages

Source: [`../backend/src/messages/messages.controller.ts`](../backend/src/messages/messages.controller.ts). Todos requieren JWT.

| Método | Path | Descripción |
|---|---|---|
| POST | `/messages/trip/:tripId` | Enviar mensaje en un trip |
| GET | `/messages/trip/:tripId?page=&limit=` | Historial paginado |
| PATCH | `/messages/trip/:tripId/read` | Marcar todos como leídos |
| GET | `/messages/conversations` | Lista de trips con último mensaje |
| GET | `/messages/unread-count` | Total no leídos del usuario |

### POST `/messages/trip/:tripId`

```jsonc
{ "content": "Estoy llegando al punto de carga" }
```

El service:
- Verifica que el sender sea participante del trip (carrier o shipper del load).
- Determina `receiverId` automáticamente (la otra parte).
- Crea el mensaje con `isRead=false`.

Mandar por WebSocket (`sendMessage`) tiene exactamente el mismo efecto — usan el mismo `MessagesService.create()`. Ver [`websockets.md`](./websockets.md).

### GET `/messages/trip/:tripId`

Devuelve la historia paginada. Admins pueden ver cualquier trip (para auditoría); shipper/carrier solo los propios.

### GET `/messages/conversations`

Lista trips activos del usuario con metadata: contraparte, último mensaje, contador de no leídos. Útil para una vista tipo inbox.

## Ratings

Source: [`../backend/src/ratings/ratings.controller.ts`](../backend/src/ratings/ratings.controller.ts). Todos requieren JWT.

| Método | Path | Descripción |
|---|---|---|
| POST | `/ratings` | Calificar un trip completado |
| GET | `/ratings/user/:userId` | Ratings recibidas por un usuario |

### POST `/ratings`

```jsonc
{
  "tripId": "trip-uuid",
  "score": 5,            // 1..5
  "comment": "Excelente servicio"   // opcional
}
```

Reglas:
- El trip tiene que estar `COMPLETED`.
- El `fromUserId` (logueado) tiene que ser participante.
- El `toUserId` se infiere automáticamente (la otra parte).
- Una rating por trip por persona (`@@unique([tripId, fromUserId])`).

### GET `/ratings/user/:userId`

Devuelve las ratings que el usuario recibió, con score, comment y datos del rater.

## Errores comunes

Respuesta uniforme via `GlobalExceptionFilter`:

```jsonc
{
  "statusCode": 400,
  "message": "El precio propuesto debe ser un número",
  "timestamp": "2026-05-23T12:34:56.789Z"
}
```

Casos típicos:

| Status | Cuándo |
|---|---|
| 400 | Validación falla (DTO inválido, campos extra con `forbidNonWhitelisted`) |
| 401 | Sin token, token expirado o credenciales mal en login |
| 403 | Rol no autorizado, `EMAIL_NOT_VERIFIED` en login, usuario inactivo |
| 404 | Recurso no encontrado |
| 409 | Conflicto (ej. unique compuesto violado en postulación duplicada) |
| 500 | Error no manejado (loguea stack en consola) |

## Cómo autenticar tu request

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cargolink.com","password":"password123"}' \
  | jq -r '.access_token')

# 2. Llamar endpoints autenticados
curl http://localhost:3001/api/users/me \
  -H "Authorization: Bearer $TOKEN"
```

En el frontend web, [`../frontend/src/lib/api.ts`](../frontend/src/lib/api.ts) lo hace automáticamente vía interceptor de Axios. En mobile, [`../mobile/src/services/api.ts`](../mobile/src/services/api.ts) lo hace leyendo el token desde AsyncStorage.

## Swagger

http://localhost:3001/api/docs incluye todos los endpoints con sus DTOs, examples, y un botón "Authorize" para fijar el Bearer token globalmente y probar.

La definición OpenAPI se genera de los decoradores `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth`, `@ApiProperty` distribuidos en controllers y DTOs. Si agregás un endpoint nuevo, sumá decoradores para que aparezca documentado.
