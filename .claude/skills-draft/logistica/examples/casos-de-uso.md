# Casos de uso típicos

Recorridos end-to-end del dominio. Sirven para entender cómo encajan roles, estados y entidades. Los estados citados son los reales de `schema.prisma` (no inventar otros).

---

## Caso 1 — Publicar carga, recibir postulaciones, asignar

1. Un **dador** (`CARGO_GENERATOR`) publica una carga: origen, destino, tipo, peso, fechas, precio. La `Load` nace en `PUBLISHED`.
2. Varios **transportistas** (`TRANSPORTER`) ven la carga disponible y se **postulan**. Cada `Postulation` nace en `PENDING`. Uno propone llevarla por el precio publicado; otro manda un `proposedPrice` distinto.
3. El dador revisa las postulaciones y **acepta una**. Esa pasa a `ACCEPTED`:
   - Se crea un `Trip` (estado `PENDING`/`ACCEPTED`).
   - La `Load` pasa a `ASSIGNED`.
   - Las otras postulaciones de esa carga quedan efectivamente `REJECTED`.

---

## Caso 2 — Negociación de precio

1. Carrier se postula con `proposedPrice` mayor al `price` de la carga. Postulación en `PENDING`, `lastOfferBy = carrier`.
2. El dador **contraoferta** un precio intermedio. La postulación pasa a `NEGOTIATING`, se setea `counterOfferPrice` y `lastOfferBy = shipper`.
3. La UI le muestra al carrier "tenés una oferta de X". El carrier puede **aceptar la oferta** o **contraofertar** de nuevo (sigue en `NEGOTIATING`, alternando `lastOfferBy`).
4. Cuando el dador acepta, la postulación pasa a `ACCEPTED` y arranca el flujo del Caso 1, paso 3.

---

## Caso 3 — Ejecución del viaje con tracking

1. Carga `ASSIGNED`, `Trip` creado.
2. El transportista **inicia** el viaje (`PATCH /trips/:id/start`): `Trip` → `IN_PROGRESS`, `Load` → `IN_TRANSIT`, se setea `startedAt`.
3. El mobile del transportista reporta posición GPS periódicamente (`PATCH /trips/:id/location`). La web del dador (`/tracking/[id]`) muestra el avance en el mapa.
4. Durante el viaje, dador y transportista **chatean** (mensajes scopeados al `tripId`, REST o Socket.IO).
5. El transportista **completa** el viaje (`PATCH /trips/:id/complete`): `Trip` → `COMPLETED`, `Load` → `DELIVERED`, se setea `completedAt`.

---

## Caso 4 — Calificación post-viaje

1. Con el `Trip` en `COMPLETED`, tanto dador como transportista pueden calificar (`POST /api/ratings`).
2. Cada uno deja `score` (1–5) + `comment` opcional. Unique `(tripId, fromUserId)` impide calificar dos veces.
3. Las calificaciones recibidas por un usuario se consultan en `GET /api/ratings/user/:userId` y alimentan su reputación.

---

## Caso 5 — Override de admin

1. Un **admin** necesita asignar una carga manualmente (sin esperar postulaciones).
2. Usa `POST /api/trips/accept/:loadId`, que crea el `Trip` directamente y pasa la `Load` a `ASSIGNED`, sin requerir una `Postulation`.
3. Desde ahí el flujo de viaje (Caso 3) sigue igual.

---

## Caso 6 — Cancelación

1. Un dador cancela una carga que todavía no fue asignada (`PUBLISHED`). La `Load` pasa a `CANCELLED` (terminal).
2. <<COMPLETAR: reglas de cancelación cuando ya hay un viaje en curso (Load `IN_TRANSIT` / Trip `IN_PROGRESS`) — confirmar con operaciones y con el service.>>
