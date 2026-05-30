# Postulaciones y negociación de precio

Una **postulación** (`Postulation`) es la forma en que un transportista se ofrece a llevar una carga. Implementa un flujo de **bidding con negociación de precio** entre el transportista (carrier) y el dador (shipper).

Estado en el enum `PostulationStatus` de `schema.prisma`:

```prisma
enum PostulationStatus { PENDING  NEGOTIATING  ACCEPTED  REJECTED  WITHDRAWN }
```

> Estos son los únicos estados. No inventes otros.

## Estados

| Estado | Significado |
|---|---|
| `PENDING` | El transportista creó la postulación. Esperando respuesta del dador. |
| `NEGOTIATING` | Alguna de las dos partes contraofertó el precio. Hay una oferta vigente esperando respuesta de la otra parte. |
| `ACCEPTED` | El dador aceptó. Se crea el `Trip` y la `Load` pasa a `ASSIGNED`. |
| `REJECTED` | Rechazada (en la práctica ocurre cuando el dador acepta otra postulación de la misma carga; no hay endpoint dedicado a rechazar). |
| `WITHDRAWN` | El transportista retiró su postulación. |

## Flujo

```
  carrier crea postulación (proposedPrice opcional)
        │
        ▼
     PENDING
        │
        ├──(carrier retira)──────────────▶ WITHDRAWN
        │
        ├──(cualquiera contraoferta)─────▶ NEGOTIATING ──(contraofertas van y vienen)──┐
        │                                       ▲────────────────────────────────────┘
        │                                       │
        └──(shipper acepta)──────────────▶ ACCEPTED  → crea Trip + Load pasa a ASSIGNED
                                                │
        (al aceptar otra postulación del mismo load, las demás quedan) REJECTED
```

## Campos de negociación

En `Postulation`:
- `message` — mensaje opcional del transportista (max 500 chars, validado en el DTO).
- `proposedPrice` — precio que propone el transportista al postularse. Si lo manda, debe ser `> 0` (regla del DTO; ver también `docs/backend.md`).
- `counterOfferPrice` — la última contraoferta vigente.
- `lastOfferBy` — id del usuario que mandó la **última** oferta. Sirve para la UI ("esperando respuesta de X"): si `lastOfferBy` es el shipper, le toca responder al carrier, y viceversa.

## Reglas duras

- **Unique `(loadId, transporterId)`**: un transportista **no puede postularse dos veces a la misma carga**. Constraint a nivel DB (`@@unique`).
- Como consecuencia, si un carrier retiró su postulación (`WITHDRAWN`), **tampoco puede crear una nueva** para esa carga — la unique sigue vigente. Soportar "re-postularse" requeriría cambiar ese constraint (decisión de producto + migración).
- Aceptar una postulación es acción del **dador** (o admin override), no del transportista.

## UI de la PostulationCard (web)

Según el rol logueado y `lastOfferBy`, los botones cambian (ver `frontend.md`):
- Shipper viendo `PENDING` → "Aceptar" + "Contraofertar".
- Shipper viendo `NEGOTIATING` con `lastOfferBy = transporter` → "Aceptar (precio del transporter)" + "Contraofertar".
- Carrier viendo `NEGOTIATING` con `lastOfferBy = shipper` → "Aceptar oferta" + "Contraofertar".
- Carrier viendo su propia `PENDING` → "Retirar".

## Notas

- <<COMPLETAR: ¿hay tope a la cantidad de contraofertas, o expiración de una postulación? confirmar con operaciones.>>
