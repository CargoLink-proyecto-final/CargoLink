# Backend

NestJS 10 + Prisma 5 + PostgreSQL 15. Source en [`../backend/`](../backend/).

Si lo que buscás es la lista de endpoints, andá a [`api.md`](./api.md). Este documento cubre la estructura del código, cómo se bootstrapea, cómo están organizados los módulos y los patrones internos (guards, decorators, filtros, mail).

## Stack y versiones

| Capa | Tecnología |
|---|---|
| Framework | NestJS 10.3 (`@nestjs/*`) |
| Lenguaje | TypeScript 5.3 (strict) |
| ORM | Prisma 5.8 |
| DB | PostgreSQL 15 |
| Auth | Passport JWT (`@nestjs/passport`, `passport-jwt`) + bcrypt |
| Validación | `class-validator` + `class-transformer` |
| WebSocket | Socket.IO via `@nestjs/platform-socket.io` |
| Docs API | Swagger via `@nestjs/swagger` |
| Mail | Nodemailer (SMTP con fallback Ethereal) |
| Export | `archiver` para ZIP de CSVs |
| Tests | Jest + ts-jest (config en `package.json`) |

`package.json` completo en [`../backend/package.json`](../backend/package.json).

## Estructura de `src/`

```
backend/src/
├── main.ts                    # bootstrap (CORS, pipes, filter, prefix, Swagger)
├── app.module.ts              # módulo raíz (importa todos los dominios)
├── auth/                      # login, register, JWT, password reset, email verify
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.module.ts
│   ├── jwt.strategy.ts        # Passport JWT strategy
│   └── dto/                   # register, login, forgot-password, reset-password, resend-verification
├── users/                     # /users
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
├── loads/                     # /loads + register + export ZIP
│   ├── loads.controller.ts
│   ├── loads.service.ts
│   ├── loads.module.ts
│   └── dto/                   # create-load, update-load, register-query
├── postulations/              # /loads/:id/postulations + /postulations/...
│   ├── postulations.controller.ts
│   ├── postulations.service.ts
│   ├── postulations.module.ts
│   └── dto/                   # create-postulation, counter-offer
├── trips/                     # /trips, /trips/my, /trips/metrics, location updates
│   ├── trips.controller.ts
│   ├── trips.service.ts
│   ├── trips.module.ts
│   └── dto/complete-trip.dto.ts  # fuelLiters
├── messages/                  # REST + Socket.IO gateway
│   ├── messages.controller.ts
│   ├── messages.gateway.ts    # /chat namespace
│   ├── messages.service.ts
│   └── messages.module.ts
├── ratings/                   # /ratings
│   ├── ratings.controller.ts
│   ├── ratings.service.ts
│   ├── ratings.module.ts
│   └── dto/create-rating.dto.ts
├── companies/                 # /companies — flotas multi-conductor (COMPANY_ADMIN)
│   ├── companies.controller.ts
│   ├── companies.service.ts
│   ├── companies.module.ts
│   └── dto/                   # create-join-request, decide-join-request
├── transporter-profile/        # /transporter-profile — documentos, vehículo, declaración jurada (P13)
│   ├── transporter-profile.controller.ts
│   ├── transporter-profile.service.ts
│   ├── transporter-profile.module.ts
│   ├── profile-completeness.ts  # computeProfileStatus — única fuente de verdad de "qué falta"
│   └── dto/                   # upload-document, upsert-vehicle, accept-terms
├── mail/                      # Nodemailer wrapper
│   ├── mail.service.ts
│   └── mail.module.ts
├── prisma/                    # PrismaService (singleton)
│   ├── prisma.service.ts
│   └── prisma.module.ts
└── common/                    # piezas transversales
    ├── decorators/
    │   ├── current-user.decorator.ts
    │   └── roles.decorator.ts
    ├── guards/
    │   ├── jwt-auth.guard.ts
    │   ├── roles.guard.ts
    │   └── profile-approved.guard.ts  # bloquea POST /loads/:id/postulations si el perfil no está aprobado
    ├── filters/
    │   └── http-exception.filter.ts
    ├── metrics.ts             # computeFuelAndDeliveryMetrics (km/litro, on-time)
    └── routing.ts             # fetchRouteDistanceKm (distancia de ruta vía OSRM)
```

## Bootstrap (`main.ts`)

Source: [`../backend/src/main.ts`](../backend/src/main.ts).

```ts
const app = await NestFactory.create(AppModule);

app.enableCors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
});

app.useGlobalFilters(new GlobalExceptionFilter());

app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));

app.setGlobalPrefix('api');

const config = new DocumentBuilder()
  .setTitle('CargoLink API')
  .setDescription('CargoLink API - Plataforma de Transporte de Carga por Carretera')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

await app.listen(process.env.PORT || 3001);
```

Decisiones:

- **CORS** explícito por env. Frontend default `http://localhost:3000` (Docker) o `:3003` (npm run dev). Si abrís el frontend desde otro origen, ajustá `CORS_ORIGIN`.
- **Prefix global `/api`** — todos los endpoints viven bajo `/api/*`. Cuando el código pone `@Controller('loads')` en realidad responde en `/api/loads`.
- **ValidationPipe global** con `whitelist + forbidNonWhitelisted + transform`. Significa:
  - Campos extra en el body se descartan (`whitelist`).
  - Si el body trae campos no declarados en el DTO, falla con 400 (`forbidNonWhitelisted`).
  - Tipos se transforman (`transform`) — un `@Query('page')` declarado como `number` realmente llega como número.
- **GlobalExceptionFilter** — uniforma respuesta de error con `statusCode`, `message`, `timestamp`.
- **Swagger** en `/api/docs` con esquema Bearer documentado.

## Módulos por dominio

### Auth (`src/auth/`)

| Endpoint | Método | Auth |
|---|---|---|
| `/api/auth/register` | POST | público |
| `/api/auth/login` | POST | público |
| `/api/auth/verify-email/:token` | GET | público |
| `/api/auth/resend-verification` | POST | público |
| `/api/auth/forgot-password` | POST | público |
| `/api/auth/reset-password` | POST | público |

Logica clave en `auth.service.ts`:

- `register()` — bcrypt para hashear el password, genera `emailVerificationToken` y envía email vía `MailService`.
- `login()` — exige `emailVerified=true`; firma JWT con payload `{ sub: userId, email, role }`.
- `verifyEmail()` — busca por token, valida expiración, marca verified.
- `forgotPassword()` / `resetPassword()` — genera reset token, lo guarda en `resetToken/resetTokenExp`, envía email; el reset valida token + expiración antes de actualizar.

Detalle del flujo y consideraciones de seguridad en [`autenticacion.md`](./autenticacion.md).

### Users (`src/users/`)

| Endpoint | Método | Auth | Roles |
|---|---|---|---|
| `/api/users/me` | GET | JWT | cualquier rol |
| `/api/users/me` | PATCH | JWT | cualquier rol |
| `/api/users` | GET | JWT | `ADMIN` |
| `/api/users/:id` | GET | JWT | cualquier rol |
| `/api/users/:id/toggle-active` | PATCH | JWT | `ADMIN` |

### Loads (`src/loads/`)

Endpoints listados arriba en la matriz; detalle en [`api.md`](./api.md).

Hay dos endpoints "register" que son específicos del dominio:

- `GET /api/loads/register` — lista loads cerrados (`DELIVERED` o `CANCELLED`) con filtros por fecha. Shipper ve los propios, carrier ve los que llevó, admin ve todo.
- `GET /api/loads/register/export` — devuelve un ZIP con `loads.csv` (datos del load + trip + carrier + shipper, 30 columnas) y `messages.csv` (todos los mensajes asociados a esos trips). Implementado con `archiver` streameado a `res`.

Las funciones `csvCell`, `csvRow`, `buildLoadsCsv` y `buildMessagesCsv` viven en el mismo controller — escapan comillas con `""` y citan celdas con caracteres especiales.

### Postulations (`src/postulations/`)

Implementa el flujo de bidding entre carrier y shipper con negociación de precio:

```
estado inicial    →   PENDING       carrier crea con proposedPrice opcional
counter-offer     →   NEGOTIATING   cualquiera de las dos partes contraofreca
shipper accept    →   ACCEPTED      crea Trip + cambia Load a ASSIGNED
carrier withdraw  →   WITHDRAWN
shipper rechaza   →   REJECTED      (no hay endpoint dedicado, solo via aceptar otra)
```

Campos relevantes en `Postulation`:
- `proposedPrice` — precio que el carrier propone (debe ser > `load.price` si lo manda).
- `counterOfferPrice` — última contraoferta vigente.
- `lastOfferBy` — string con el id del usuario que mandó la última oferta. Permite mostrar UI tipo "esperando respuesta de X".

Unique compuesto `(loadId, transporterId)` — un mismo carrier no puede postularse dos veces al mismo load. Si retiró una postulación (`WITHDRAWN`), tampoco puede crear otra (la unique sigue ahí; habría que dropearla antes para soportar ese caso).

### Transporter Profile (`src/transporter-profile/`)

Endpoints listados en [`api.md`](./api.md#transporter-profile). Documentos de identidad/habilitación (DNI, licencia, seguro, VTV, etc.), vehículo y declaración jurada de un `TRANSPORTER` — perfil que un admin tiene que aprobar antes de que el transportista pueda postularse a una carga (ver `ProfileApprovedGuard` más abajo).

Puntos de diseño:
- `computeProfileStatus` (`profile-completeness.ts`) es una función pura, sin dependencias de Nest/Prisma — la comparten el guard, `GET /transporter-profile/status` y la cola del admin, así nunca divergen sobre "qué le falta a un transportista". `loadProfileStatus` (`profile-status.ts`) junta las piezas desde la DB y la llama.
- Upload de archivos: primera vez que el repo usa `multer` (vía `FileInterceptor`, storage en memoria + `fileFilter` que solo acepta `image/jpeg`, `image/png`, `application/pdf`, límite 5MB). El archivo se escribe a mano en `UPLOAD_DIR/<userId>/<type>.<ext>` — no hay carpeta estática pública, `GET /transporter-profile/documents/:id/file` es el único punto de acceso y valida ownership.
- `Document` es genérico (`DocumentType` enum + `fileUrl` + `status`) en vez de una tabla por tipo de documento — agregar un tipo nuevo es un valor más del enum.
- Revisión por el admin (CU-11): `TransporterReviewController` + `TransporterReviewService` en el mismo módulo, bajo `/admin/transporter-reviews`. El admin aprueba o rechaza cada documento con motivo y el transportista recibe un único mail por revisión (`MailService.sendDocumentsRejectedEmail` / `sendProfileApprovedEmail`).
- Re-revisión: si el transportista cambia un dato que un documento aprobado respalda (vehículo → cédula/seguro/VTV, CUIT → AFIP, licencia → frente/dorso), ese documento vuelve a `PENDING` (`sendApprovedDocumentsBackToReview`). Re-subir un archivo también lo vuelve a `PENDING` y limpia el motivo de rechazo.

### Trips (`src/trips/`)

| Endpoint | Método | Roles |
|---|---|---|
| `/api/trips/accept/:loadId` | POST | `ADMIN` (override) |
| `/api/trips` | GET | `ADMIN` |
| `/api/trips/my` | GET | `TRANSPORTER` |
| `/api/trips/metrics` | GET | `TRANSPORTER` |
| `/api/trips/my-loads` | GET | `CARGO_GENERATOR` |
| `/api/trips/:id` | GET | cualquier rol autenticado |
| `/api/trips/:id/start` | PATCH | `TRANSPORTER` |
| `/api/trips/:id/complete` | PATCH | `TRANSPORTER` |
| `/api/trips/:id/location` | PATCH | `TRANSPORTER` |

`POST /trips/accept/:loadId` es un override de admin que **no requiere postulación** — útil para asignar manualmente. El flujo normal de carrier va por `POST /postulations/:id/accept` (lo invoca el shipper, no el carrier).

`PATCH /trips/:id/location` se llama desde mobile periódicamente con `{ lat, lng }`. El service valida que el carrier sea el dueño del trip y que el estado sea `IN_PROGRESS`.

`PATCH /trips/:id/complete` recibe `{ fuelLiters }` (litros cargados durante el viaje), marca el trip `COMPLETED` y calcula `distanceKm` de la ruta vía OSRM (`fetchRouteDistanceKm` en `src/common/routing.ts`). `GET /trips/metrics` agrega esos datos con `computeFuelAndDeliveryMetrics` (`src/common/metrics.ts`): eficiencia km/litro y tasa de entregas a tiempo. Las mismas métricas, por chofer, las consume el admin de empresa (ver más abajo y [`empresas.md`](./empresas.md)).

### Messages (`src/messages/`)

REST + WebSocket conviven. REST cubre:

| Endpoint | Método | Para qué |
|---|---|---|
| `/api/messages/trip/:tripId` | POST | enviar mensaje (también vía WS) |
| `/api/messages/trip/:tripId` | GET | historial paginado |
| `/api/messages/trip/:tripId/read` | PATCH | marcar todos como leídos |
| `/api/messages/conversations` | GET | lista de trips activos del usuario con último mensaje |
| `/api/messages/unread-count` | GET | total no leídos del usuario |

El WebSocket reusa `MessagesService.create()`, así que mandar por POST o por `sendMessage` desemboca en lo mismo. Detalle del gateway en [`websockets.md`](./websockets.md).

### Ratings (`src/ratings/`)

| Endpoint | Método | Roles |
|---|---|---|
| `/api/ratings` | POST | cualquier rol autenticado |
| `/api/ratings/user/:userId` | GET | cualquier rol autenticado |

Cada usuario califica una vez por trip (`@@unique([tripId, fromUserId])`). El service valida que el solicitante sea participante del trip y que el trip esté en estado `COMPLETED`.

### Companies (`src/companies/`)

Gestión de flotas multi-conductor. Un `COMPANY_ADMIN` administra una empresa y sus choferes (`TRANSPORTER`). Endpoints divididos por lado:

| Endpoint | Método | Roles |
|---|---|---|
| `/api/companies` | GET | cualquier rol (directorio) |
| `/api/companies/my-membership` | GET | `TRANSPORTER` |
| `/api/companies/join-requests` | POST | `TRANSPORTER` |
| `/api/companies/join-requests/:requestId` | DELETE | `TRANSPORTER` |
| `/api/companies/leave` | POST | `TRANSPORTER` |
| `/api/companies/me` | GET | `COMPANY_ADMIN` |
| `/api/companies/me/drivers` | GET | `COMPANY_ADMIN` |
| `/api/companies/me/drivers/:driverId/stats` | GET | `COMPANY_ADMIN` |
| `/api/companies/me/drivers/:driverId` | DELETE | `COMPANY_ADMIN` |
| `/api/companies/me/requests` | GET | `COMPANY_ADMIN` |
| `/api/companies/me/requests/:requestId` | PATCH | `COMPANY_ADMIN` |
| `/api/companies/me/trips` | GET | `COMPANY_ADMIN` |

Patrón clave de seguridad: el lado admin nunca confía en un `companyId` del request — `companies.service.ts` resuelve la empresa con `getOwnedCompany(ownerId)` desde el usuario logueado. La aprobación de una solicitud asigna `user.companyId` y actualiza el estado en una transacción (`prisma.$transaction`). Flujo completo, modelo de datos y respuestas en [`empresas.md`](./empresas.md).

### Mail (`src/mail/`)

Wrapper de Nodemailer con dos modos:

1. **SMTP real** — si `SMTP_HOST` **y** `SMTP_USER` están seteados, crea el transport con esos credentials. `SMTP_FROM` controla el header From.
2. **Ethereal fallback** — si falta alguno de los dos, crea automáticamente una cuenta Ethereal de testing. Los emails no se entregan; se loguea una URL de preview por cada send.

Templates HTML + plain text **en español**. Los enlaces de verify/reset apuntan a `${FRONTEND_URL}/auth/verify-email?token=...` y `${FRONTEND_URL}/auth/reset-password?token=...`.

Métodos:
- `sendVerificationEmail(to, firstName, token)` — link de 24h.
- `sendPasswordResetEmail(to, firstName, token)` — link de 1h.

Source: [`../backend/src/mail/mail.service.ts`](../backend/src/mail/mail.service.ts).

### Prisma (`src/prisma/`)

`PrismaService` extiende `PrismaClient` y se exporta como provider global. Maneja `$connect()` en `onModuleInit` y `$disconnect()` en `onModuleDestroy`. Cualquier service que necesita acceso a la DB lo inyecta:

```ts
constructor(private prisma: PrismaService) {}
```

## Common — piezas transversales

### `JwtAuthGuard`

`AuthGuard('jwt')` from `@nestjs/passport`. Se aplica con `@UseGuards(JwtAuthGuard)` en clases o métodos. Toda la app excepto `AuthController` lo usa.

### `RolesGuard`

```ts
canActivate(context) {
  const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
    context.getHandler(), context.getClass(),
  ]);
  if (!required) return true;
  const { user } = context.switchToHttp().getRequest();
  return required.includes(user.role);
}
```

Si no hay `@Roles(...)` declarado, deja pasar. Se encadena después de `JwtAuthGuard` para asegurar que `request.user` esté seteado:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CARGO_GENERATOR')
```

### `ProfileApprovedGuard`

Bloquea una acción si el perfil del transportista no está aprobado: tiene que estar completo (documentos + vehículo + declaración jurada, ver [`api.md`](./api.md#transporter-profile)) y con los 8 documentos aprobados por un admin. Ver cargas sigue permitido; solo se bloquea postularse. Inyecta `PrismaService` directamente (es `@Global()`, no hace falta importar `PrismaModule`) y reusa `loadProfileStatus` — la misma lectura que usa `GET /transporter-profile/status`, para que el guard y el endpoint de estado nunca diverjan. No es global: se aplica solo donde importa (hoy, `POST /loads/:loadId/postulations`):

```ts
@UseGuards(RolesGuard, ProfileApprovedGuard)
@Roles('TRANSPORTER')
```

Si no está aprobado, tira `ForbiddenException({ message, state, missing, pendingReview, rejected })` — los campos extra sobreviven en la respuesta gracias a que `GlobalExceptionFilter` copia cualquier campo extra del body de la excepción.

### `@Roles(...roles)`

Decorator que pone metadata `roles` para que `RolesGuard` la lea:

```ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

Uso típico: `@Roles('CARGO_GENERATOR', 'TRANSPORTER')`.

### `@CurrentUser()`

Extrae el user del request (puesto ahí por `JwtStrategy.validate()`):

```ts
@Get('me')
getProfile(@CurrentUser('id') userId: string) { ... }

@Post()
create(@CurrentUser() user: { id, email, role }) { ... }
```

Sin argumento devuelve el objeto entero `{ id, email, role }`.

### `GlobalExceptionFilter`

Catchea todo. Estructura de respuesta uniforme:

```json
{
  "statusCode": 400,
  "message": "...",
  "timestamp": "2026-05-23T..."
}
```

Si el error original es `HttpException`, respeta el status y el body. Errores no manejados se loguean al console y devuelven 500.

## Mail service — un caveat para tener presente

`getTransporter()` decide entre SMTP real y Ethereal **una sola vez** por instancia del servicio (cachea en `this.transporter`). Si arrancás el server sin SMTP y después agregás credenciales en `.env`, el server tiene que reiniciarse para que tome el cambio.

## Scripts (`backend/package.json`)

```bash
npm run build           # nest build → dist/
npm run start           # nest start (sin watch)
npm run start:dev       # nest start --watch (con hot reload)
npm run start:debug     # con inspector + watch
npm run start:prod      # node dist/main (lo que corre la imagen)
npm run lint            # eslint con --fix
npm run test            # jest una vez
npm run test:watch      # jest --watch
npm run test:cov        # jest --coverage
npm run prisma:generate # prisma generate
npm run prisma:migrate  # prisma migrate dev (crea + aplica migración)
npm run prisma:studio   # prisma studio en :5555
npm run prisma:seed     # ts-node prisma/seed.ts
```

## Tests

Hay infraestructura de Jest configurada en `package.json` (`testRegex`: `.*\.spec\.ts$`, root `src/`, transform con `ts-jest`), pero **hoy no hay archivos `*.spec.ts`** en el repo. Cuando se agreguen, van junto al archivo que testean (`auth.service.spec.ts`, etc.).

## Convenciones del repo backend

- Un módulo NestJS por dominio. Si un endpoint cruza dominios (p.ej. crear trip al aceptar postulation), el service de un dominio inyecta el de otro vía DI.
- Validación siempre con DTO + class-validator. Nada de parsear `req.body` a mano.
- Errores semánticos vía `BadRequestException`, `ForbiddenException`, `NotFoundException`, etc. — el filter global se encarga del formato.
- Decorators de Swagger (`@ApiTags`, `@ApiOperation`, `@ApiBearerAuth`, `@ApiProperty`) en todo lo público. La doc de `/api/docs` es generada — no se edita a mano.
- Snake case para columnas DB (`@map("first_name")`); camelCase en TS. La conversión la hace Prisma.

## Comandos de dev habituales

```bash
# arrancar en watch
npm run start:dev

# crear migración nueva tras tocar schema.prisma
npx prisma migrate dev --name <slug-descriptivo>

# regenerar el cliente de Prisma tras pull
npx prisma generate

# abrir Prisma Studio para ver/editar datos
npx prisma studio

# resetear DB (descartando datos) — solo en dev
npx prisma migrate reset
```
