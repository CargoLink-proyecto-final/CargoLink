# Empresas y flotas

Funcionalidad multi-conductor: un **administrador de empresa** (`COMPANY_ADMIN`) gestiona una flota de transportistas (`TRANSPORTER`). Los choferes solicitan unirse, el admin aprueba/rechaza, y el admin ve los viajes y métricas de toda su flota.

Source backend: [`../backend/src/companies/`](../backend/src/companies/). Frontend: `frontend/src/app/dashboard/company-admin/` (lado admin) y `frontend/src/app/company/` (lado chofer). **No implementado en mobile.**

## Modelo de datos

Tres piezas en el schema Prisma (detalle en [`base-de-datos.md`](./base-de-datos.md)):

- **`Company`** — la flota. `ownerId` (`@unique`) apunta al usuario `COMPANY_ADMIN` dueño: un usuario administra a lo sumo una empresa.
- **`User.companyId`** — membresía del chofer. `null` = transportista independiente. Un chofer pertenece a una sola empresa.
- **`CompanyJoinRequest`** — solicitud de un chofer para entrar a una empresa. Unique `(companyId, transporterId)`: una fila por par empresa-chofer, reutilizada en re-postulaciones.

```
  COMPANY_ADMIN ──owns(1:1)──▶ Company ──members(1:N)──▶ User (TRANSPORTER)
                                  │
                                  └──requests(1:N)──▶ CompanyJoinRequest ──▶ User (chofer)
```

## Roles y autorización

| Acción | Rol requerido |
|---|---|
| Ver directorio de empresas | cualquier usuario autenticado |
| Solicitar unirse / cancelar solicitud / salir | `TRANSPORTER` |
| Aprobar/rechazar solicitudes, gestionar choferes, ver flota | `COMPANY_ADMIN` (scopeado a su propia empresa) |

Todo el lado admin se resuelve internamente con `getOwnedCompany(ownerId)`: nunca se confía en un `companyId` del request — la empresa se deriva del usuario logueado. Un `COMPANY_ADMIN` solo puede operar sobre su propia flota.

## Flujo de incorporación de un chofer

```
  chofer (TRANSPORTER)              backend                 admin (COMPANY_ADMIN)
       │                              │                            │
       ├─GET /companies──────────────▶│  (directorio)              │
       │                              │                            │
       ├─POST /companies/join-requests│ (status=PENDING)           │
       │                              │                            │
       │                              │◀─GET /companies/me/requests┤
       │                              │                            │
       │                              │◀─PATCH .../requests/:id────┤
       │                              │   { decision: APPROVE }    │
       │                              │   → user.companyId = company.id
       │                              │   → request.status = APPROVED
```

Reglas del flujo (en `companies.service.ts`):
- No se puede solicitar si ya pertenecés a una empresa (`409 Conflict`).
- No se puede solicitar dos veces estando pendiente (`409`). Si una solicitud previa fue **rechazada**, una nueva solicitud **reutiliza la misma fila** y la resetea a `PENDING` (upsert sobre el unique `companyId+transporterId`).
- Al **aprobar**, se valida que el chofer siga libre; la asignación (`user.companyId`) y el cambio de estado de la solicitud ocurren en una **transacción** (`prisma.$transaction`).
- **Cancelar** una solicitud pendiente la borra (solo el dueño de la solicitud, solo si está `PENDING`).
- **Salir** de la empresa setea `user.companyId = null` (solo si pertenecía a una).

## Endpoints

Source: [`../backend/src/companies/companies.controller.ts`](../backend/src/companies/companies.controller.ts). Prefijo `/api`. Todos requieren JWT.

### Directorio (cualquier rol)

| Método | Path | Descripción |
|---|---|---|
| GET | `/companies` | Directorio: `{ id, name, _count.members }` ordenado por nombre |

### Lado chofer (`TRANSPORTER`)

| Método | Path | Descripción |
|---|---|---|
| GET | `/companies/my-membership` | Empresa actual + historial de solicitudes |
| POST | `/companies/join-requests` | Solicitar unirse (`{ companyId }`) |
| DELETE | `/companies/join-requests/:requestId` | Cancelar solicitud pendiente propia |
| POST | `/companies/leave` | Salir de la empresa actual |

```jsonc
// POST /companies/join-requests
{ "companyId": "company-uuid" }
```

### Lado admin de empresa (`COMPANY_ADMIN`)

| Método | Path | Descripción |
|---|---|---|
| GET | `/companies/me` | Overview: empresa + `memberCount` + `pendingRequests` |
| GET | `/companies/me/drivers` | Listado de choferes (sin password ni tokens) |
| GET | `/companies/me/drivers/:driverId/stats` | Métricas de performance de un chofer |
| DELETE | `/companies/me/drivers/:driverId` | Remover chofer de la flota (`companyId = null`) |
| GET | `/companies/me/requests` | Solicitudes (filtro `?status=PENDING\|APPROVED\|REJECTED`) |
| PATCH | `/companies/me/requests/:requestId` | Aprobar/rechazar (`{ decision: "APPROVE" \| "REJECT" }`) |
| GET | `/companies/me/trips` | Viajes de los choferes de la flota |

```jsonc
// PATCH /companies/me/requests/:requestId
{ "decision": "APPROVE" }   // o "REJECT"
```

`GET /companies/me/trips` acepta `?status=`, `?driverId=`, `?from=`, `?to=`, `?page=`, `?limit=` y devuelve `{ trips, total, page, limit, totalPages }` con `load` y `carrier` incluidos.

### Métricas de un chofer (`GET /companies/me/drivers/:driverId/stats`)

Devuelve, para el chofer indicado (debe pertenecer a la empresa del admin):

```jsonc
{
  "driver": { "id": "...", "firstName": "...", "lastName": "...", "email": "...", "phone": "...", "avatarUrl": null },
  "totalTrips": 12,
  "completedTrips": 9,
  "activeTrips": 2,
  "totalRevenue": 1850000,        // suma de price de trips completados
  "avgRating": 4.6,               // promedio de ratings recibidas
  "ratingsCount": 7,
  // + métricas de combustible y puntualidad (computeFuelAndDeliveryMetrics):
  "onTimeRate": 0.88,
  "avgKmPerLiter": 3.2
  // ...resumen mensual
}
```

El cómputo de combustible/puntualidad reutiliza `computeFuelAndDeliveryMetrics` de [`../backend/src/common/metrics.ts`](../backend/src/common/metrics.ts) — el **mismo** que alimenta el dashboard del transportista (`GET /trips/metrics`). Ver [`api.md`](./api.md) § Trips. `totalRevenue` sale de `resolveTripPrice`: el precio pactado vive en la postulación aceptada, no en `load.price`.

### GET `/companies/me/metrics`

Métricas **agregadas de la flota** para el panel del admin de empresa, con los mismos helpers puros que el panel del transportista (un chofer y su empresa nunca ven números distintos del mismo viaje):

- Facturación: `totalAmount`, `amountThisMonth`, `avgAmountPerTrip`, `amountPerKm`, `monthly` (12 meses).
- Operación: `avgKmPerLiter` y puntualidad de toda la flota, `totalTrips` / `completedTrips` / `activeTrips`.
- Utilización: `activeDriverCount`, `utilizationRate`, `idleDriverCount` (sin viaje en curso ni entregas en 30 días).
- `driverRanking`: un registro por chofer (facturación, km, km/L, puntualidad, rating, `idle`), ordenado por facturación.

## Frontend

- **Admin de empresa**: `frontend/src/app/dashboard/company-admin/` con sub-rutas `drivers`, `drivers/[id]`, `requests`, `trips`.
- **Chofer**: `frontend/src/app/company/` para ver el directorio, solicitar unión y ver el estado de la membresía.
- Cliente HTTP: grupo `companiesApi` en [`../frontend/src/lib/api.ts`](../frontend/src/lib/api.ts).

## Notas

- La empresa **no** participa del flujo de loads/postulaciones/trips directamente: un chofer de empresa se postula y maneja trips igual que uno independiente. La empresa es una capa de **agrupación y visibilidad** (el admin ve a sus choferes), no un actor del bidding.
- No hay endpoint para **crear** una empresa vía API en este controller: el vínculo `Company.ownerId` se establece fuera de este flujo (ver seed en [`../backend/prisma/seed.ts`](../backend/prisma/seed.ts), que crea un `COMPANY_ADMIN` con empresa, choferes y una solicitud pendiente de demo).
</content>
