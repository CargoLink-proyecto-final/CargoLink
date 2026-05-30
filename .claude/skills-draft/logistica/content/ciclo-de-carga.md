# Ciclo de vida de una carga (Load)

La **carga** (`Load`) es la entidad central: representa algo que un dador necesita transportar de un origen a un destino. Su estado vive en el enum `LoadStatus` de `schema.prisma`:

```prisma
enum LoadStatus { PUBLISHED  ASSIGNED  IN_TRANSIT  DELIVERED  CANCELLED }
```

> **Importante:** estos son los **únicos** estados que existen. No inventes otros. Prisma no enforcea las transiciones — la lógica de transición vive en la capa de servicio del backend.

## Estados

| Estado | Significado |
|---|---|
| `PUBLISHED` | Recién creada por el dador. Visible para los transportistas. Acepta postulaciones. |
| `ASSIGNED` | El dador aceptó una postulación (o un admin asignó). Ya tiene un transportista y un `Trip` asociado, pero el viaje todavía no arrancó. |
| `IN_TRANSIT` | El transportista inició el viaje; la carga está en camino. |
| `DELIVERED` | Entregada. Estado terminal. |
| `CANCELLED` | Cancelada. Estado terminal. |

`DELIVERED` y `CANCELLED` son **estados cerrados/terminales** — la carga aparece en el "registro" de cargas cerradas (`GET /api/loads/register`, exportable a ZIP).

## Flujo feliz

```
  PUBLISHED ──(dador acepta postulación / admin asigna)──▶ ASSIGNED
      │                                                       │
      │                                          (transportista inicia viaje)
      │                                                       ▼
      │                                                  IN_TRANSIT
      │                                                       │
      │                                       (transportista marca entregado)
      │                                                       ▼
      │                                                   DELIVERED  (terminal)
      │
      └──(dador cancela)──────────────────────────────────▶ CANCELLED  (terminal)
```

## Relación con el resto del modelo

- Una `Load` la publica un `CARGO_GENERATOR` (`Load.shipperId → User.id`).
- Una `Load` recibe muchas **postulaciones** (`Load 1:N Postulation`).
- Cuando se asigna, se crea **un** viaje (`Load 1:1 Trip` — `Trip.loadId` es `@unique`). El estado del `Load` y el del `Trip` evolucionan en paralelo (la carga pasa a `IN_TRANSIT`/`DELIVERED` cuando el viaje arranca/termina).

## Campos clave de `Load`

(Ver `docs/base-de-datos.md` para la tabla completa.)

- `title`, `description`
- `originAddress` / `originLat` / `originLng` y `destAddress` / `destLat` / `destLng` — origen y destino con coordenadas (para el mapa).
- `cargoType` — tipo de carga (texto libre, ej. "Electronics").
- `weight` (kg), `volume` (m³, opcional).
- `pickupDate` (fecha de recogida), `deliveryDate` (opcional).
- `price` — precio ofrecido por el dador. Es el punto de partida de la negociación.

## Notas

- El precio del `Load` es lo que el dador ofrece; el transportista puede proponer otro (`proposedPrice`) al postularse, y de ahí arranca la negociación (ver `postulaciones.md`).
- <<COMPLETAR: ¿hay alguna regla de negocio sobre cancelar una carga ya `ASSIGNED` o `IN_TRANSIT`? confirmar con operaciones / el service de loads.>>
