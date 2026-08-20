# Arquitectura

CargoLink es una plataforma multi-cliente con un backend único que sirve a tres superficies: una web app, una mobile app (iOS + Android) y una API pública documentada. El estado vive en una sola base PostgreSQL.

## Diagrama de alto nivel

```
                        ┌──────────────────────────────┐
                        │      Artifact Registry       │
                        │  cargolink-backend:<tag>     │
                        │  cargolink-frontend:<tag>    │
                        └───────────┬──────────────────┘
                                    │ gcloud run deploy
                                    ▼
   ┌────────────────────────────────────────────────────────────────┐
   │                     GCP Cloud Run                              │
   │                                                                │
   │   ┌─────────────────┐      ┌─────────────────┐                 │
   │   │   Next.js 14    │      │   NestJS 10     │                 │
   │   │   (frontend)    │─────▶│   (backend)     │                 │
   │   │   port 3000     │ HTTP │   port 3001     │                 │
   │   │                 │  WS  │   /api          │                 │
   │   │                 │◀────▶│   /chat (ws)    │                 │
   │   └─────────────────┘      └────────┬────────┘                 │
   │                                     │ Prisma                   │
   │                                     ▼                          │
   │                            ┌─────────────────┐                 │
   │                            │  PostgreSQL 15  │                 │
   │                            │   port 5432     │                 │
   │                            │  volume pgdata  │                 │
   │                            └─────────────────┘                 │
   └─────────────────────────────────────┬──────────────────────────┘
                                         │ HTTP + WS
                                         ▼
                              ┌──────────────────────┐
                              │  Expo (RN) mobile    │
                              │  iOS / Android       │
                              │  GPS + push          │
                              └──────────────────────┘
```

Las tres apps comparten el mismo contrato REST (ver [`api.md`](./api.md)) y el mismo namespace de WebSocket (ver [`websockets.md`](./websockets.md)).

## Componentes

### Backend — NestJS 10 + Prisma 5

Servidor único que expone:
- **REST** bajo `/api` con prefijo global y Swagger en `/api/docs`.
- **Socket.IO** en namespace `/chat` para mensajería en tiempo real.

Modular: 9 dominios (Auth, Users, Loads, Postulations, Trips, Messages, Ratings, Companies, Mail) + 2 módulos de infraestructura (Prisma, common). JWT con Passport para auth, RBAC con guards propios. Detalle en [`backend.md`](./backend.md).

### Frontend web — Next.js 14 App Router

SSR + client components con Tailwind. Rutas organizadas por feature y por rol (`/dashboard/admin`, `/dashboard/shipper`, `/dashboard/carrier`, `/dashboard/company-admin`). Estado de auth en Zustand persistido a `sessionStorage` (sesión aislada por pestaña), estado de servidor en TanStack Query. Mapa con Leaflet (`react-leaflet`). Detalle en [`frontend.md`](./frontend.md).

### Mobile — Expo SDK 50 + React Native 0.73

Bottom-tabs por rol (shipper/carrier) sobre stack de auth. Usa `react-native-maps` (Google Maps), `expo-location` para GPS y `expo-notifications` para push. Token en `AsyncStorage`. Detalle en [`mobile.md`](./mobile.md).

### Base de datos — PostgreSQL 15

8 tablas (`users`, `companies`, `company_join_requests`, `loads`, `postulations`, `trips`, `messages`, `ratings`) más 5 enums. Migraciones gestionadas por Prisma; la imagen del backend corre `prisma migrate deploy` al arrancar. Detalle en [`base-de-datos.md`](./base-de-datos.md).

### Infraestructura — Docker Compose (dev local) + GCP Cloud Run (prod)

`docker-compose.yml` orquesta los tres servicios solo para dev local. Producción corre en GCP Cloud Run + Cloud SQL (proyecto `project-9dc11c1e-5a14-4076-a74`): las imágenes se buildean en GitHub Actions y se publican a Artifact Registry, y el deploy lo hace `gcloud run deploy` por entorno (`dev`/`prod`). Infra como código en `infra/gcp/` (Terraform). Detalle en [`docker.md`](./docker.md), [`ci-cd.md`](./ci-cd.md) e [`infra/gcp/README.md`](../infra/gcp/README.md).

## Roles del sistema

Cuatro roles definidos en el enum `Role` de Prisma:

| Rol | Internamente | Quién | Qué hace |
|---|---|---|---|
| **Shipper** | `CARGO_GENERATOR` | Dador de carga | Publica loads, recibe postulaciones, acepta una, sigue el viaje, califica al carrier. |
| **Carrier** | `TRANSPORTER` | Transportista | Ve loads disponibles, se postula (con precio opcional), maneja el trip activo, reporta GPS, califica al shipper. Puede pertenecer a una empresa. |
| **Company Admin** | `COMPANY_ADMIN` | Administrador de flota | Gestiona su empresa: aprueba/rechaza choferes, ve trips y métricas de su flota. Detalle en [`empresas.md`](./empresas.md). |
| **Admin** | `ADMIN` | Operador interno | Vista global, fuerza la asignación de loads, exporta el registro, gestiona usuarios. |

## Flujo end-to-end (caso feliz)

```
  shipper                  backend                 carrier               admin
     │                        │                       │                    │
     ├─POST /loads───────────▶│                       │                    │
     │                        │                       │                    │
     │                        │◀──GET /loads/available┤                    │
     │                        │                       │                    │
     │                        │◀──POST .../postulations (con proposedPrice)│
     │                        │                       │                    │
     ├─GET .../postulations──▶│                       │                    │
     │                        │                       │                    │
     ├─POST .../accept───────▶│                       │                    │
     │                        ├──crea Trip (PENDING)──┤                    │
     │                        │                       │                    │
     │                        │◀──PATCH /trips/:id/start──┤                │
     │                        │   (IN_PROGRESS)       │                    │
     │                        │                       │                    │
     │                        │◀──PATCH /trips/:id/location (loop)─┤       │
     │                        │                       │                    │
     │   chat via /chat WS (ambos en room trip_<id>)  │                    │
     │◀──────────────────────▶│◀─────────────────────▶│                    │
     │                        │                       │                    │
     │                        │◀──PATCH /trips/:id/complete──┤             │
     │                        │   (COMPLETED, load DELIVERED)              │
     │                        │                       │                    │
     ├─POST /ratings─────────▶│◀──POST /ratings───────┤                    │
     │                        │                       │                    │
     │                        │◀──GET /loads/register/export───────────────┤
     │                        │   (ZIP: loads.csv + messages.csv)          │
```

Hay una variante de negociación: cualquiera de las dos partes puede mandar `counter-offer` antes de aceptar, lo que pasa la postulation a estado `NEGOTIATING`. Ver el detalle en [`api.md`](./api.md) sección Postulations.

Al completar el trip, el carrier informa los litros de combustible (`fuelLiters`) y el backend calcula la distancia de la ruta (`distanceKm`) vía OSRM. Esos datos alimentan las métricas de eficiencia (km/litro) y puntualidad del transportista (`GET /trips/metrics`) y, agregadas, las de la flota (ver [`empresas.md`](./empresas.md)).

## Matriz de roles × endpoints

Resumen — listado exhaustivo en [`api.md`](./api.md).

| Área | Shipper | Carrier | Admin |
|---|---|---|---|
| Crear loads | ✅ | — | — |
| Ver todos los loads | ✅ | ✅ (solo `PUBLISHED` via `/available`) | ✅ |
| Postularse a un load | — | ✅ | — |
| Aceptar postulation | ✅ (propias) | — | — |
| Counter-offer | ✅ | ✅ | — |
| Force-accept (sin postulation) | — | — | ✅ |
| Start/complete trip | — | ✅ (asignado) | — |
| Update GPS | — | ✅ (asignado) | — |
| Ver todos los trips | — | ✅ (propios via `/my`) | ✅ |
| Chat en trip | ✅ (en sus loads) | ✅ (en sus trips) | ✅ (lectura en `/api/messages/trip/:id`) |
| Calificar trip | ✅ | ✅ | — |
| Listar usuarios | — | — | ✅ |
| Toggle usuario activo | — | — | ✅ |
| Exportar registro ZIP | ✅ (propios) | ✅ (propios) | ✅ (todos) |

El rol **Company Admin** (`COMPANY_ADMIN`) opera sobre su propia flota (aprobar/rechazar choferes, ver trips y métricas de la empresa) — no participa del flujo de loads/postulaciones. Detalle de sus endpoints en [`empresas.md`](./empresas.md).

## Decisiones de stack

- **NestJS sobre Express**: estructura modular fuerte (un módulo por dominio), DI nativa, guards/interceptors/pipes built-in, Swagger automático desde decorators. Acelera el desarrollo de una API con muchos roles.
- **Prisma sobre TypeORM**: schema declarativo, migraciones generadas automáticamente desde el diff, type-safety end-to-end, query engine fuera del proceso Node.
- **Next.js 14 App Router**: server components por default reducen el JS al cliente; rutas dinámicas con `[id]` simples; standalone build minimiza la imagen Docker.
- **Expo (managed)**: una sola base de código para iOS + Android, EAS Build cuando llegue a release. Permite trabajar sin Xcode/Android Studio en dev usando Expo Go.
- **PostgreSQL**: relacional fuerte por el dominio (foreign keys reales: load → trip → messages/ratings, postulation con unique compuesto, etc.).
- **Socket.IO**: mensajería en tiempo real con rooms; el mismo namespace cubre web y mobile; reconnect automático.
- **Zustand**: estado de auth global sin boilerplate; suficiente para lo que hace el frontend hoy. React Query maneja el server state.

## Archivos críticos como referencia

- Backend bootstrap: [`../backend/src/main.ts`](../backend/src/main.ts).
- Schema Prisma: [`../backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).
- Compose: [`../docker-compose.yml`](../docker-compose.yml).
- Workflow CI/CD: [`../.github/workflows/deploy-gcp.yml`](../.github/workflows/deploy-gcp.yml).
- WebSocket gateway: [`../backend/src/messages/messages.gateway.ts`](../backend/src/messages/messages.gateway.ts).
- Frontend API client: [`../frontend/src/lib/api.ts`](../frontend/src/lib/api.ts).
- Mobile API client: [`../mobile/src/services/api.ts`](../mobile/src/services/api.ts).
