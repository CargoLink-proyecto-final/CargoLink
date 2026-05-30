# Calificaciones (Ratings)

Al terminar un viaje, cada participante puede **calificar** al otro. Modelo `Rating` en `schema.prisma`.

## Campos

- `tripId` → el viaje (`Trip`).
- `fromUserId` → quién califica.
- `toUserId` → a quién se califica.
- `score` — entero **1 a 5** (rango validado en el DTO `create-rating.dto.ts`).
- `comment` — comentario opcional.
- `createdAt` — solo fecha de creación (no hay `updatedAt`).

## Reglas duras

- **Unique `(tripId, fromUserId)`**: cada usuario califica **una sola vez por viaje** (constraint `@@unique`).
- El service exige que:
  - el solicitante sea **participante del viaje** (el dador o el transportista del trip), y
  - el viaje esté en estado **`COMPLETED`** (no se puede calificar un viaje en curso).
- Como hay dos participantes por viaje, un `Trip` puede acumular **hasta 2 ratings** (uno por persona). Relación `Trip 1:N Rating`.

## Endpoints

- `POST /api/ratings` — crear una calificación (cualquier rol autenticado, sujeto a las reglas de arriba).
- `GET /api/ratings/user/:userId` — listar las calificaciones **recibidas** por un usuario (índice `@@index([toUserId])`).

## Para qué sirve en el producto

La reputación construida con los ratings recibidos ayuda a dadores y transportistas a decidir con quién operar. Un transportista con buen promedio es más elegible; un dador con buen promedio da más confianza para postularse.

## Notas

- <<COMPLETAR: ¿se muestra el promedio de score en el perfil / en las cards? confirmar con producto y frontend.>>
- <<COMPLETAR: ¿hay moderación de comentarios? confirmar con operaciones.>>
