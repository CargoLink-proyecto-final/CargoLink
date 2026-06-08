# Resumen — dónde está todo

Mapa completo del repositorio CargoLink. Si llegaste acá sin contexto, esta página te dice **qué hay, dónde está y a qué doc ir** para el detalle. Es el índice "de arriba hacia abajo": del repo entero, a cada feature, a los archivos concretos.

> Para el detalle de cada tema, seguí los links a los docs específicos. El índice temático completo está en [`README.md`](./README.md).

## Vista de 10 segundos

CargoLink es una **plataforma de transporte de carga por carretera** que conecta dadores de carga (shippers) con transportistas (carriers), con un rol admin de plataforma y un rol admin de empresa (flotas). Un backend NestJS único sirve a tres superficies: **web** (Next.js), **mobile** (Expo) y **API REST** documentada con Swagger. El estado vive en **PostgreSQL** vía Prisma. Chat en tiempo real por **Socket.IO**. Deploy en **GCP Cloud Run**.

El flujo central: shipper publica una `Load` → carriers se postulan (`Postulation`, con negociación de precio) → al aceptar se abre un `Trip` con tracking GPS y chat → al cerrarse, ambas partes se califican (`Rating`).

## Estructura del repositorio

```
CargoLink-deploy/
├── backend/          API NestJS 10 + Prisma 5 (REST /api + WebSocket /chat)
├── frontend/         Web app Next.js 14 (App Router)
├── mobile/           App React Native + Expo SDK 50 (iOS/Android)
├── infra/            Infraestructura como código (Terraform → GCP)
├── docs/             Documentación técnica (este folder)
├── .claude/          Tooling de Claude Code (hooks, skills, agents, commands)
├── .github/          GitHub Actions (CI/CD a Cloud Run)
├── .githooks/        Git hook opcional de validación de commits
├── docker-compose.yml   Stack de dev local (postgres + backend + frontend)
├── .env.example      Plantilla de variables de entorno
├── CLAUDE.md         Reglas operativas para Claude Code (branching, commits, PRs)
└── README.md         Landing del repo + quick start
```

| Carpeta / archivo | Qué es | Doc de referencia |
|---|---|---|
| `backend/` | Servidor NestJS: REST, WebSocket, Prisma, auth, mail | [`backend.md`](./backend.md), [`api.md`](./api.md) |
| `frontend/` | Web app Next.js 14 App Router | [`frontend.md`](./frontend.md) |
| `mobile/` | App Expo / React Native | [`mobile.md`](./mobile.md) |
| `infra/gcp/` | Terraform de GCP (Cloud Run, Cloud SQL, Secret Manager, LB) | [`arquitectura-gcp.md`](./arquitectura-gcp.md), [`infra/gcp/README.md`](../infra/gcp/README.md) |
| `docs/` | Documentación técnica | [`README.md`](./README.md) |
| `.claude/` | Hooks, skills, agents y slash-commands de Claude Code | [`workflow-claude-code.md`](./workflow-claude-code.md) |
| `.github/workflows/` | Pipeline de deploy a Cloud Run | [`ci-cd.md`](./ci-cd.md) |
| `docker-compose.yml` | Orquesta el stack de dev local | [`docker.md`](./docker.md) |

## Roles del sistema

Enum `Role` en Prisma — **4 roles**:

| Rol | Interno | Qué hace |
|---|---|---|
| **Shipper** | `CARGO_GENERATOR` | Publica loads, recibe postulaciones, acepta una, sigue el viaje, califica al carrier. |
| **Carrier** | `TRANSPORTER` | Ve loads disponibles, se postula (con negociación), maneja el trip, reporta GPS, califica al shipper. Puede pertenecer a una empresa. |
| **Company Admin** | `COMPANY_ADMIN` | Administra una flota: aprueba/rechaza choferes, ve trips y métricas de sus choferes. |
| **Admin** | `ADMIN` | Vista global de plataforma, fuerza asignaciones, exporta registro, gestiona usuarios. |

Detalle de autorización en [`autenticacion.md`](./autenticacion.md). Matriz rol × endpoint en [`arquitectura.md`](./arquitectura.md).

## Dónde está cada feature (full-stack)

Cada fila cruza las tres capas. Útil cuando vas a tocar una funcionalidad de punta a punta.

| Feature | Backend (`backend/src/`) | Frontend (`frontend/src/`) | Mobile (`mobile/src/`) |
|---|---|---|---|
| **Auth / registro / verificación** | `auth/` | `app/auth/*`, `store/auth.ts`, `lib/api.ts` (`authApi`) | `screens/auth/*`, `store/auth.ts`, `services/api.ts` (`authApi`) |
| **Perfil de usuario** | `users/` | `app/users/`, `lib/api.ts` (`usersApi`) | `screens/.../ProfileScreen` |
| **Cargas (loads)** | `loads/` | `app/loads/*`, `lib/api.ts` (`loadsApi`) | `screens/shipper/*`, `screens/carrier/AvailableLoadsScreen` |
| **Postulaciones / negociación** | `postulations/` | `components/postulations/*`, `lib/api.ts` (`postulationsApi`) | `screens/.../LoadDetailScreen` |
| **Viajes (trips) + GPS + métricas** | `trips/`, `common/metrics.ts`, `common/routing.ts` | `app/trips/*`, `app/tracking/*`, `components/maps/*` | `screens/.../TrackingScreen`, `services/api.ts` (`tripsApi`) |
| **Chat en tiempo real** | `messages/` (+ `messages.gateway.ts`) | `app/messages/*`, `lib/api.ts` (`messagesApi`) | `screens/.../Chat*Screen`, `services/api.ts` (`messagesApi`) |
| **Calificaciones (ratings)** | `ratings/` | `components/ratings/*`, `lib/api.ts` (`ratingsApi`) | `screens/.../RatingScreen` |
| **Empresas / flotas** | `companies/` | `app/dashboard/company-admin/*`, `app/company/`, `lib/api.ts` (`companiesApi`) | — (no implementado en mobile) |
| **Registro / export CSV** | `loads/` (`/register`, `/register/export`) | `components/register/*`, `hooks/useRegister.ts` | — |
| **Email (verificación, reset)** | `mail/` | — | — |

Doc dedicada por feature: cargas/viajes/postulaciones en [`api.md`](./api.md), chat en [`websockets.md`](./websockets.md), empresas en [`empresas.md`](./empresas.md), auth en [`autenticacion.md`](./autenticacion.md).

## Backend — mapa de módulos

NestJS modular: **9 dominios** (Auth, Users, Loads, Postulations, Trips, Messages, Ratings, Companies, Mail) + **2 módulos de infraestructura** (Prisma, common). Bootstrap en `backend/src/main.ts`, root module en `backend/src/app.module.ts`.

| Módulo | Path | Responsabilidad | Endpoints clave |
|---|---|---|---|
| Auth | `src/auth/` | Registro, login, verificación email, reset password, JWT | `POST /auth/{register,login,reset-password}`, `GET /auth/verify-email/:token` |
| Users | `src/users/` | Perfil propio, listado/admin de usuarios | `GET/PATCH /users/me`, `GET /users` (admin) |
| Loads | `src/loads/` | CRUD de cargas, filtros, registro + export ZIP | `POST /loads`, `GET /loads/{available,my,register}` |
| Postulations | `src/postulations/` | Bidding y negociación de precio | `POST /loads/:id/postulations`, `POST /postulations/:id/{accept,counter-offer,accept-offer}` |
| Trips | `src/trips/` | Ciclo de viaje, GPS, métricas combustible/on-time | `PATCH /trips/:id/{start,complete,location}`, `GET /trips/metrics` |
| Messages | `src/messages/` | Chat por trip (REST + gateway WebSocket `/chat`) | `POST/GET /messages/trip/:tripId`, evento `sendMessage` |
| Ratings | `src/ratings/` | Calificación post-viaje | `POST /ratings`, `GET /ratings/user/:id` |
| Companies | `src/companies/` | Flotas, choferes, join requests, métricas de flota | `GET /companies/me/*` (admin), `POST /companies/join-requests` (chofer) |
| Mail | `src/mail/` | Envío de emails (Nodemailer) | — (servicio interno) |
| Prisma | `src/prisma/` | `PrismaService` singleton | — (infra) |
| Common | `src/common/` | Guards, decorators, filter, `metrics.ts`, `routing.ts` | — (infra) |

**Piezas transversales** (`src/common/`):
- `guards/jwt-auth.guard.ts` — valida el JWT.
- `guards/roles.guard.ts` — chequea `@Roles(...)`.
- `decorators/current-user.decorator.ts` — `@CurrentUser()`.
- `decorators/roles.decorator.ts` — `@Roles(...)`.
- `filters/http-exception.filter.ts` — formato uniforme de error.
- `metrics.ts` — función pura: on-time rate, km/litro, resumen mensual.
- `routing.ts` — distancia de ruta vía OSRM (al completar un trip).

Detalle en [`backend.md`](./backend.md). Referencia REST completa en [`api.md`](./api.md).

## Frontend web — mapa de rutas

Next.js 14 App Router en `frontend/src/app/`. Estado de auth en `store/auth.ts` (Zustand sobre `sessionStorage`, scope por pestaña), server state en TanStack Query, cliente HTTP en `lib/api.ts` (Axios con interceptor de Bearer token).

| Ruta | Para qué |
|---|---|
| `/` | Redirección al dashboard según rol |
| `/auth/{login,register,forgot-password,reset-password,verify-email,check-email}` | Flujos de cuenta |
| `/dashboard/{shipper,carrier,admin,company-admin}` | Dashboards por rol |
| `/dashboard/company-admin/{drivers,drivers/[id],requests,trips}` | Gestión de flota |
| `/loads`, `/loads/new`, `/loads/[id]`, `/loads/[id]/edit` | Cargas |
| `/trips`, `/trips/[id]` | Viajes |
| `/tracking`, `/tracking/[id]` | Seguimiento GPS en mapa (Leaflet) |
| `/messages`, `/messages/trip/[tripId]` | Chat |
| `/company` | Membresía/solicitudes (vista chofer/shipper) |
| `/users` | Directorio de usuarios |

Componentes agrupados por dominio en `frontend/src/components/` (`maps/`, `postulations/`, `ratings/`, `register/`, layout, UI). Utilidades geo (OSRM + Nominatim) en `lib/routing.ts`. Detalle en [`frontend.md`](./frontend.md).

## Mobile — mapa de pantallas

Expo SDK 50 / React Native 0.73 en `mobile/src/`. Navegación en `navigation/AppNavigator.tsx`: stack de auth + bottom-tabs por rol (shipper/carrier) + stack modal. Estado de auth en `store/auth.ts` (Zustand sobre `AsyncStorage`, persistente).

- **Auth stack**: Login, Register, ForgotPassword.
- **Tabs Shipper**: Dashboard, MyLoads, Tracking, Messages, Profile.
- **Tabs Carrier**: Dashboard, AvailableLoads, Tracking, Messages, Profile.
- **Modales**: LoadDetail, Chat, CreateLoad, Rating.
- **Servicios**: `services/api.ts` (cliente HTTP), `services/notifications.ts` (push Expo), `services/routing.ts`.

Mapas con `react-native-maps`, GPS con `expo-location`, push con `expo-notifications`. Detalle en [`mobile.md`](./mobile.md).

## Base de datos — mapa de modelos

PostgreSQL 15 vía Prisma. Schema en `backend/prisma/schema.prisma`. **8 tablas + 5 enums.**

| Modelo (tabla) | Para qué |
|---|---|
| `User` (`users`) | Identidad de todos los roles; membresía/propiedad de empresa |
| `Company` (`companies`) | Flota; `ownerId` es el `COMPANY_ADMIN` |
| `CompanyJoinRequest` (`company_join_requests`) | Solicitud de chofer para unirse a una empresa |
| `Load` (`loads`) | Carga publicada por un shipper |
| `Postulation` (`postulations`) | Oferta de un carrier sobre un load (con negociación) |
| `Trip` (`trips`) | Viaje (load asignado a carrier); GPS, combustible, distancia |
| `Message` (`messages`) | Mensaje de chat dentro de un trip |
| `Rating` (`ratings`) | Calificación post-viaje |

Enums: `Role`, `JoinRequestStatus`, `LoadStatus`, `TripStatus`, `PostulationStatus`. Migraciones en `backend/prisma/migrations/`, seed en `backend/prisma/seed.ts`. Detalle completo (campos, relaciones, índices, migraciones) en [`base-de-datos.md`](./base-de-datos.md).

## Infraestructura y tooling

| Qué | Dónde | Doc |
|---|---|---|
| **Dev local** | `docker-compose.yml` (postgres :5432, backend :3001, frontend :3000) | [`docker.md`](./docker.md), [`primeros-pasos.md`](./primeros-pasos.md) |
| **IaC GCP** | `infra/gcp/*.tf` (Cloud Run, Cloud SQL, Secret Manager, Artifact Registry, LB) | [`arquitectura-gcp.md`](./arquitectura-gcp.md), [`infra/gcp/README.md`](../infra/gcp/README.md) |
| **CI/CD** | `.github/workflows/deploy-gcp.yml` (deploy keyless vía WIF a `dev`/`prod`) | [`ci-cd.md`](./ci-cd.md), [`deployment.md`](./deployment.md) |
| **Validación de commits** | `.githooks/commit-msg` (opt-in) + hook `PreToolUse` de Claude | [`contribuir.md`](./contribuir.md) |
| **Tooling Claude Code** | `.claude/` (hooks, skills, agents, slash-commands) | [`workflow-claude-code.md`](./workflow-claude-code.md), [`.claude/README.md`](../.claude/README.md) |

## Comandos más usados

```bash
# Stack completo (dev local)
docker compose up -d                # levanta postgres + backend + frontend
docker compose logs backend         # logs

# Backend
cd backend && npm test              # jest
cd backend && npm run lint          # eslint
npm run prisma:migrate              # prisma migrate dev
npm run prisma:seed                 # cargar datos demo
npm run prisma:studio              # inspector visual

# Frontend
cd frontend && npm run lint
cd frontend && npm run build
```

Endpoints locales: Frontend http://localhost:3000 · API http://localhost:3001/api · Swagger http://localhost:3001/api/docs · Postgres localhost:5432.

## Para profundizar

- **Levantar el proyecto**: [`primeros-pasos.md`](./primeros-pasos.md).
- **Arquitectura lógica**: [`arquitectura.md`](./arquitectura.md). **Física (GCP)**: [`arquitectura-gcp.md`](./arquitectura-gcp.md).
- **Contribuir** (gitflow, commits, PRs): [`contribuir.md`](./contribuir.md).
- **Índice completo de docs**: [`README.md`](./README.md).
</content>
</invoke>
