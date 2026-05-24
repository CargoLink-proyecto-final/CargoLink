# Base de datos

PostgreSQL 15 con Prisma 5.8 como ORM. Schema en [`../backend/prisma/schema.prisma`](../backend/prisma/schema.prisma); migraciones bajo [`../backend/prisma/migrations/`](../backend/prisma/migrations/).

## Convenciones del schema

- IDs son `String` UUID con `@default(uuid())` — generados por Prisma del lado del cliente.
- Snake case para columnas DB (`@map("first_name")`), camelCase en TS.
- Snake case para nombres de tabla (`@@map("users")`).
- Todos los modelos con `createdAt`/`updatedAt` salvo donde solo aplica `createdAt` (Message, Rating).
- Índices declarados explícitamente sobre columnas usadas en filtros y joins.

## Enums

```prisma
enum Role           { CARGO_GENERATOR  TRANSPORTER  ADMIN }
enum LoadStatus     { PUBLISHED  ASSIGNED  IN_TRANSIT  DELIVERED  CANCELLED }
enum TripStatus     { PENDING  ACCEPTED  IN_PROGRESS  COMPLETED  CANCELLED }
enum PostulationStatus { PENDING  NEGOTIATING  ACCEPTED  REJECTED  WITHDRAWN }
```

Estados manejados desde la capa de servicio — Prisma no enforced transitions.

## Modelos

### `User` (tabla `users`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` UUID PK | |
| `email` | `String` `@unique` | |
| `password` | `String` | bcrypt hash |
| `firstName` / `lastName` | `String` | `first_name` / `last_name` |
| `phone` | `String?` | |
| `role` | `Role` | default `CARGO_GENERATOR` |
| `companyName` | `String?` | `company_name` |
| `avatarUrl` | `String?` | `avatar_url` (no usado todavía) |
| `isActive` | `Boolean` | default `true`; admin lo toggleea |
| `resetToken` / `resetTokenExp` | `String?` / `DateTime?` | password reset |
| `emailVerified` | `Boolean` | default `false` |
| `emailVerificationToken` | `String? @unique` | |
| `emailVerificationTokenExp` | `DateTime?` | |
| `createdAt` / `updatedAt` | `DateTime` | |

Relaciones:
- `loads` — como shipper (`ShipperLoads`).
- `trips` — como carrier (`CarrierTrips`).
- `postulations` — como transporter (`TransporterPostulations`).
- `sentMessages` / `receivedMessages` (`SentMessages` / `ReceivedMessages`).
- `givenRatings` / `receivedRatings` (`RatingFrom` / `RatingTo`).

### `Load` (tabla `loads`)

| Campo | Tipo |
|---|---|
| `id` | UUID PK |
| `shipperId` → `User.id` | |
| `title` | `String` |
| `description` | `String?` |
| `originAddress` / `originLat` / `originLng` | `String` / `Float` / `Float` |
| `destAddress` / `destLat` / `destLng` | `String` / `Float` / `Float` |
| `cargoType` | `String` |
| `weight` | `Float` (kg) |
| `volume` | `Float?` (m³) |
| `pickupDate` | `DateTime` |
| `deliveryDate` | `DateTime?` |
| `price` | `Float` |
| `status` | `LoadStatus` default `PUBLISHED` |
| `createdAt` / `updatedAt` | |

Relaciones:
- `shipper` (User).
- `trip` (Trip, 1-to-1; nullable hasta asignación).
- `postulations` (Postulation, 1-to-many).

Índices:
- `[shipperId]`
- `[status]`
- `[pickupDate]`
- `[originLat, originLng]` (compuesto, para queries geo aproximadas)
- `[destLat, destLng]`

### `Postulation` (tabla `postulations`)

| Campo | Tipo |
|---|---|
| `id` | UUID PK |
| `loadId` → `Load.id` | |
| `transporterId` → `User.id` | |
| `message` | `String?` (max 500 enforced en DTO) |
| `proposedPrice` | `Float?` (> 0 si presente) |
| `counterOfferPrice` | `Float?` |
| `lastOfferBy` | `String?` (user id del último que ofertó) |
| `status` | `PostulationStatus` default `PENDING` |
| `createdAt` / `updatedAt` | |

Constraints e índices:
- `@@unique([loadId, transporterId])` — un carrier no puede postularse dos veces al mismo load.
- `@@index([loadId, status])`
- `@@index([transporterId])`

### `Trip` (tabla `trips`)

| Campo | Tipo |
|---|---|
| `id` | UUID PK |
| `loadId` `@unique` → `Load.id` | un trip por load |
| `carrierId` → `User.id` | |
| `status` | `TripStatus` default `PENDING` |
| `currentLat` / `currentLng` | `Float?` (GPS actual) |
| `startedAt` / `completedAt` | `DateTime?` |
| `notes` | `String?` |
| `createdAt` / `updatedAt` | |

Relaciones:
- `load` (Load).
- `carrier` (User).
- `ratings` (Rating, 1-to-many).
- `messages` (Message, 1-to-many).

Índices:
- `[carrierId]`
- `[status]`

### `Message` (tabla `messages`)

| Campo | Tipo |
|---|---|
| `id` | UUID PK |
| `senderId` → `User.id` | |
| `receiverId` → `User.id` | |
| `tripId` → `Trip.id` | scope: la conversación es por trip |
| `content` | `String` |
| `isRead` | `Boolean` default `false` |
| `createdAt` | `DateTime` (no `updatedAt`) |

Índices:
- `[tripId]` — historial por trip.
- `[senderId, receiverId]` — queries directas entre dos usuarios.
- `[receiverId, isRead]` — count de no leídos.

### `Rating` (tabla `ratings`)

| Campo | Tipo |
|---|---|
| `id` | UUID PK |
| `tripId` → `Trip.id` | |
| `fromUserId` → `User.id` | quién califica |
| `toUserId` → `User.id` | a quién |
| `score` | `Int` (1..5 enforced en DTO) |
| `comment` | `String?` |
| `createdAt` | |

Constraints:
- `@@unique([tripId, fromUserId])` — una rating por trip por persona.
- `@@index([toUserId])` — para consultar ratings recibidas.

## Diagrama de relaciones

```
                  ┌──────────────┐
                  │     User     │
                  └──┬──┬──┬──┬──┘
   shipper           │  │  │  └─── ratings (from/to)
   (ShipperLoads) ───┘  │  │
                        │  │  carrier (CarrierTrips)
                        │  └────────────────────┐
                        │                        │
                  transporter                    │
                  (TransporterPostulations)      │
                        │                        │
                        ▼                        ▼
                  ┌──────────────┐         ┌──────────────┐
                  │ Postulation  │         │     Trip     │
                  └──────┬───────┘         └──┬─────┬─────┘
                         │                    │     │
                         ▼                    ▼     ▼
                  ┌──────────────┐        ┌────────┐  ┌────────┐
                  │     Load     │◀───────│        │  │Message │
                  └──────┬───────┘   1:1  └────────┘  └────────┘
                         │
                  shipperId → User
```

Cardinalidades clave:
- `Load 1:N Postulation` — varios carriers se postulan al mismo load.
- `Load 1:1 Trip` — un load asignado tiene exactamente un trip (loadId es unique en Trip).
- `Trip 1:N Message` — todo mensaje vive bajo un trip.
- `Trip 1:N Rating` — hasta 2 ratings (uno por participante) por trip.

## Migraciones

Folder: [`../backend/prisma/migrations/`](../backend/prisma/migrations/).

| Migración | Cambio |
|---|---|
| `20260401174523_init` | Schema inicial: users, loads, trips |
| `20260408195158_add_trip_messages` | Tabla `messages` con relación a `trips` |
| `20260515211044_rename_user_roles` | Refinamiento de enum `Role` (renombre de valores) |
| `20260515223353_add_email_verification` | Campos `emailVerified`, `emailVerificationToken`, `emailVerificationTokenExp` |
| `20260516230123_add_postulations` | Tabla `postulations` con flujo de bidding |
| `20260520000000_add_price_negotiation` | Columnas `counterOfferPrice`, `lastOfferBy` para negociación |

`migration_lock.toml` registra el provider (`postgresql`) — no editarlo.

### Cómo crear una migración nueva

Cambiá `schema.prisma` con el cambio deseado y corré:

```bash
cd backend
npx prisma migrate dev --name <slug-descriptivo>
```

Prisma:
1. Diffea el schema contra el estado actual de la DB.
2. Genera un archivo SQL en `prisma/migrations/<timestamp>_<slug>/migration.sql`.
3. Aplica el SQL.
4. Re-genera el cliente (`@prisma/client`).

Para applicar migraciones en un entorno no-dev (CI, prod):

```bash
npx prisma migrate deploy
```

(Es lo que corre el `docker-entrypoint.sh` del backend al startup.)

### Resetear DB local

⚠️ Borra todo:

```bash
npx prisma migrate reset
```

Re-aplica desde cero + corre el seed automáticamente.

### Inspector visual

```bash
npx prisma studio    # http://localhost:5555
```

Útil para ver/editar datos en dev sin tener que entrar a psql.

## Seed

Archivo: [`../backend/prisma/seed.ts`](../backend/prisma/seed.ts).

Crea 3 usuarios y 1 load. Idempotente:

- **Users**: `prisma.user.upsert()` por email — no duplica si ya existen, no actualiza nada si update es `{}`.
- **Load demo**: primero `findFirst` por `(shipperId, title='Electrónica a Córdoba')`; si existe, lo reusa; si no, `create`.

Cuentas creadas (password `password123` para todas, hasheado con bcrypt cost 10):

| Email | Rol |
|---|---|
| `admin@cargolink.com` | `ADMIN` |
| `shipper@example.com` | `CARGO_GENERATOR` |
| `carrier@example.com` | `TRANSPORTER` |

Load: "Electrónica a Córdoba", pickup +5 días, delivery +7 días desde el momento del seed.

### Ejecutar el seed manualmente

Con npm scripts (TS directo):

```bash
cd backend
npm run prisma:seed   # ts-node prisma/seed.ts
```

Dentro del contenedor Docker:

```bash
docker compose exec backend node dist/prisma/seed.js
```

## Backups y restore

**No automatizado en este repo.** El `docker-entrypoint.sh` no toma backup. Si vas a probar algo destructivo en una DB con datos reales, hacelo manualmente:

```bash
# dump
docker compose exec postgres pg_dump -U postgres cargolink > backup-$(date +%F).sql

# restore
docker compose exec -T postgres psql -U postgres cargolink < backup-2026-05-23.sql
```

Para producción, ver la sección de backup en [`deployment.md`](./deployment.md) — es un gap reconocido del setup actual.

## Convenciones al evolucionar el schema

- **Una migración por cambio lógico**. No mezclar "agregar columna" + "renombrar tabla" en una sola.
- **Naming de migración**: `<timestamp>_<slug-en-snake-case>` lo genera Prisma; vos elegís el slug. Que sea descriptivo (`add_email_verification`, `add_price_negotiation`).
- **No editar migraciones aplicadas**. Si te equivocaste, creá una nueva que corrija.
- **Cambios destructivos** (drop column, drop table): coordinar con el equipo y considerar deploy en dos pasos (1: dejar de leer la columna; 2: drop después).
- **Indexar antes de queries pesadas**. Prisma no agrega índices automáticamente — si vas a filtrar por una columna nueva, agregá `@@index([...])`.
- **Tipos de fecha**: usar `DateTime` (Prisma) — internamente es `timestamp` en Postgres. Para fechas sin hora, sigue siendo `DateTime` pero por convención setealo a `00:00:00Z`.
