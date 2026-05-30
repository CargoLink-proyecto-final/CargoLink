# Viajes y tracking GPS

Un **viaje** (`Trip`) representa la ejecución del transporte de una carga ya asignada. Se crea cuando el dador acepta una postulación (o un admin asigna). Relación `Load 1:1 Trip` (`Trip.loadId` es `@unique` — un viaje por carga).

Estado en el enum `TripStatus` de `schema.prisma`:

```prisma
enum TripStatus { PENDING  ACCEPTED  IN_PROGRESS  COMPLETED  CANCELLED }
```

> Estos son los únicos estados. No inventes otros.

## Estados

| Estado | Significado |
|---|---|
| `PENDING` | Viaje recién creado (default). |
| `ACCEPTED` | Aceptado / confirmado. |
| `IN_PROGRESS` | El transportista inició el viaje; está en ruta. La carga asociada está `IN_TRANSIT`. |
| `COMPLETED` | Viaje terminado / entregado. Habilita las calificaciones. |
| `CANCELLED` | Cancelado. |

> Nota: `Trip` y `Load` tienen enums de estado **distintos pero correlacionados**. Cuando el transportista inicia el viaje, el `Trip` pasa a `IN_PROGRESS` y la `Load` a `IN_TRANSIT`; al completar, `Trip` → `COMPLETED` y `Load` → `DELIVERED`.
> <<COMPLETAR: confirmar el mapeo exacto Trip↔Load en el service de trips/postulations.>>

## Campos clave de `Trip`

- `loadId` (`@unique`) → la carga.
- `carrierId` → el transportista (`User`).
- `status` (`TripStatus`).
- `currentLat` / `currentLng` — última posición GPS reportada (nullable hasta el primer reporte).
- `startedAt` / `completedAt` — timestamps del ciclo.
- `notes` — notas del viaje (opcional).

## Acciones del transportista (endpoints)

(Ver `docs/backend.md` para la matriz completa.)

- `PATCH /api/trips/:id/start` — inicia el viaje (`TRANSPORTER`).
- `PATCH /api/trips/:id/location` — reporta posición GPS `{ lat, lng }`. Lo llama el **mobile periódicamente**. El service valida que el carrier sea dueño del trip y que el estado sea `IN_PROGRESS`.
- `PATCH /api/trips/:id/complete` — marca el viaje como completado (`TRANSPORTER`).
- `GET /api/trips/my` — sus viajes (`TRANSPORTER`); `GET /api/trips/my-loads` — del lado del dador (`CARGO_GENERATOR`).
- `POST /api/trips/accept/:loadId` — **override de admin** para asignar sin postulación.

## Tracking en tiempo real (web)

- El mobile del transportista envía su posición con `PATCH /trips/:id/location` mientras el viaje está `IN_PROGRESS`.
- La web (`/tracking/[id]`) muestra un **mapa Leaflet** (`components/maps/MapView.tsx`) con tres markers: origen (verde), destino (rojo) y posición actual del transportista (azul). La pantalla poolea `tripsApi.getById()` cada N segundos para refrescar la posición.

## Chat por viaje

Toda la mensajería vive **bajo un viaje** (`Message.tripId → Trip.id`, relación `Trip 1:N Message`). Es decir, dador y transportista solo pueden chatear una vez que existe un viaje que los vincula.

- REST: `POST /api/messages/trip/:tripId`, `GET /api/messages/trip/:tripId`, `PATCH .../read`, `GET /api/messages/conversations`, `GET /api/messages/unread-count`.
- Realtime: gateway Socket.IO (namespace `/chat`). Mandar por WebSocket o por POST desemboca en el mismo `MessagesService.create()`.

## Notas

- <<COMPLETAR: ¿cada cuántos segundos reporta el GPS el mobile? confirmar valor real con el equipo mobile.>>
