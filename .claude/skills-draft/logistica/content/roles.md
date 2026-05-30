# Roles

CargoLink tiene **tres roles**, definidos en el enum `Role` de `schema.prisma`:

```prisma
enum Role { CARGO_GENERATOR  TRANSPORTER  ADMIN }
```

El rol se guarda en `User.role` (default `CARGO_GENERATOR`) y viaja dentro del JWT (`{ sub, email, role }`). La autorización por rol se aplica en el backend con `@Roles(...)` + `RolesGuard`.

---

## `CARGO_GENERATOR` — Dador de carga (shipper)

Quien **publica cargas** que necesita transportar. En el habla del producto se lo llama **dador de carga** o, en inglés, **shipper**.

Qué puede hacer:
- Publicar una carga (`Load`) con origen, destino, tipo de carga, peso, volumen, fechas y precio.
- Editar / cancelar sus propias cargas.
- Ver las **postulaciones** que recibe en cada carga.
- **Aceptar** una postulación (asigna el transportista y crea el viaje) o **contraofertar** el precio.
- Ver el progreso del viaje (tracking GPS) y chatear con el transportista.
- Calificar al transportista al terminar el viaje.

Un shipper **solo ve y opera sobre sus propias cargas** (ownership chequeado en el service).

---

## `TRANSPORTER` — Transportista (carrier)

Quien **transporta** la carga. Se lo llama **transportista** o **carrier**.

Qué puede hacer:
- Ver las cargas disponibles (publicadas).
- **Postularse** a una carga, opcionalmente proponiendo un precio (`proposedPrice`).
- Negociar el precio (contraofertar) o **retirar** su postulación.
- Una vez aceptado: ejecutar el **viaje** (`Trip`) — iniciarlo, ir reportando su posición GPS, completarlo.
- Chatear con el dador durante el viaje.
- Calificar al dador al terminar.

Un carrier **solo opera sobre sus propios viajes y postulaciones**.

---

## `ADMIN`

Rol de administración de la plataforma.

Qué puede hacer:
- Listar todos los usuarios (`GET /api/users`) y activar/desactivar cuentas (`PATCH /api/users/:id/toggle-active`).
- Ver todos los viajes (`GET /api/trips`) y todas las cargas.
- **Override de asignación**: `POST /api/trips/accept/:loadId` asigna un viaje **sin requerir una postulación** (asignación manual).
- Acceder al registro de cargas cerradas y su export.

---

## Tabla resumen

| Acción | CARGO_GENERATOR | TRANSPORTER | ADMIN |
|---|---|---|---|
| Publicar carga | ✅ (las propias) | — | — |
| Ver cargas disponibles | — | ✅ | ✅ |
| Postularse a una carga | — | ✅ | — |
| Aceptar postulación / asignar | ✅ (en sus cargas) | — | ✅ (override) |
| Contraofertar precio | ✅ | ✅ | — |
| Iniciar / completar viaje | — | ✅ (los propios) | — |
| Reportar GPS | — | ✅ | — |
| Chatear en el viaje | ✅ | ✅ | — |
| Calificar | ✅ | ✅ | — |
| Gestionar usuarios | — | — | ✅ |

> Esta tabla refleja la matriz de `@Roles(...)` documentada en `docs/backend.md`. Si cambia un guard, actualizar acá.
