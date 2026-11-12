# Casos de prueba: técnicas de caja negra

Parte del [plan de pruebas](plan-de-pruebas.md) (v1.0, 2026-10-23). Diseña casos para las entradas y las reglas del módulo `trips` con **clases de equivalencia**, **valores límite**, **tablas de decisión** y **transición de estados**. Los resultados esperados se fijaron antes de ejecutar. Cada caso usa la plantilla del Anexo A del plan, resumida en una fila.

Cómo se ejecutaron:

- **API en dev:** requests reales a `https://dev.cargolink.com.ar` con la cuenta `e2e-carrier`, el 2026-10-23 (`develop` @ `ae5f79c`). Se corrieron desde el contenedor del backend para no sacar la contraseña del VPS. Después se restauró la ubicación original del viaje.
- **DTO:** `class-validator` sobre las clases compiladas del contenedor de dev, con las mismas opciones del `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`). Es la misma validación que corre antes de llegar al controller.
- **Automatizado:** test de jest que ya existe y cubre el caso. Corre en cada CI.

Estados: ✅ pasa · ❌ falla (con issue) · ⏳ no ejecutado.

---

## 1. Ubicación del camión: `PATCH /trips/:id/location`

**Requisito RF-05:** el transportista asignado reporta la posición del camión mientras el viaje está en curso, y el dador la ve en el mapa.

### Clases de equivalencia

| Variable | Clase | Tipo | Representante |
|---|---|---|---|
| `lat` | EQ-1: número en [-90, 90] | Válida | -31,42 |
| | EQ-2: número < -90 | Inválida | -90,0001 |
| | EQ-3: número > 90 | Inválida | 90,0001 |
| | EQ-4: no numérico | Inválida | `"abc"` |
| | EQ-5: ausente o `null` | Inválida | `{lng}` |
| `lng` | EQ-6: número en [-180, 180] | Válida | -64,18 |
| | EQ-7: número < -180 | Inválida | -180,0001 |
| | EQ-8: número > 180 | Inválida | 180,0001 |
| Body | EQ-9: solo `lat` y `lng` | Válida | |
| | EQ-10: con campos de más | Inválida | `{lat, lng, foo}` |
| Estado del viaje | EQ-11: `IN_PROGRESS` | Válida | |
| | EQ-12: cualquier otro (`ACCEPTED`, `COMPLETED`, …) | Inválida | `COMPLETED` |
| Actor | EQ-13: transportista asignado | Válida | |
| | EQ-14: otro rol, sin token, otro transportista | Inválida | dador |

### Valores límite

Con una precisión de 4 decimales (unos 11 m, más fina que la del GPS de un celular):

```
lat:  -90.0001 │ -90  ……  0  ……  90 │ 90.0001
               ▲ inválido   válido   ▲ inválido
lng: -180.0001 │ -180 …… 0 …… 180 │ 180.0001
```

### Casos

| ID | Clases / límite | Entrada | Esperado | Obtenido (dev) | Estado |
|---|---|---|---|---|---|
| CP-LOC-01 | EQ-1, EQ-6, EQ-9 (típico) | `{lat:-31.42, lng:-64.18}` | 200, posición guardada | 200 | ✅ |
| CP-LOC-02 | Límite inferior válido | `{lat:-90, lng:-180}` | 200 | 200 | ✅ |
| CP-LOC-03 | Límite superior válido | `{lat:90, lng:180}` | 200 | 200 | ✅ |
| CP-LOC-04 | Valor central (cero) | `{lat:0, lng:0}` | 200, sin convertir 0 en `null` | 200, guardó 0/0 | ✅ |
| CP-LOC-05 | EQ-2, primer inválido abajo | `{lat:-90.0001, lng:0}` | 400 | **200, guardado** | ❌ #170 |
| CP-LOC-06 | EQ-3, primer inválido arriba | `{lat:90.0001, lng:0}` | 400 | **200, guardado** | ❌ #170 |
| CP-LOC-07 | EQ-7 | `{lat:0, lng:-180.0001}` | 400 | **200, guardado** | ❌ #170 |
| CP-LOC-08 | EQ-8 | `{lat:0, lng:180.0001}` | 400 | **200, guardado** | ❌ #170 |
| CP-LOC-09 | EQ-4 | `{lat:"abc", lng:-64.18}` | 400 con mensaje de validación | **500**, y la respuesta incluye el detalle de `prisma.trip.update()` | ❌ #170 |
| CP-LOC-10 | EQ-5 | `{lng:-64.18}`, `{lat:null, lng:0}`, `{}` | 400 | **200**. Con `null` borra la última ubicación | ❌ #170 |
| CP-LOC-11 | EQ-10 | `{lat:-31.42, lng:-64.18, foo:1}` | 400 (`forbidNonWhitelisted`) | **200** | ❌ #170 |
| CP-LOC-12 | EQ-12 | Posición válida, viaje `COMPLETED` | 400 | **200**, actualiza un viaje cerrado | ❌ #170 |
| CP-LOC-13 | EQ-14 (otro rol) | Dador con token válido | 403 | 403 | ✅ |
| CP-LOC-14 | EQ-14 (sin token) | Sin `Authorization` | 401 | 401 | ✅ |
| CP-LOC-15 | EQ-14 (otro transportista) | Token de otro transportista | 403 | Automatizado: `trips.service.spec.ts` › `updateLocation` › *throws ForbiddenException when the trip belongs to another carrier* | ✅ |
| CP-LOC-16 | Viaje inexistente | UUID que no existe | 404 | 404 | ✅ |

Los casos de coordenadas se corrieron sobre un viaje `COMPLETED`, el que el E2E deja en dev. Para las clases de rango y de tipo no cambia la conclusión: si el rango se validara, la respuesta sería 400 en cualquier estado. Con el viaje `IN_PROGRESS` y coordenadas válidas (EQ-1 + EQ-11), el caso se ejecuta en cada deploy (paso 6 del E2E) y en cada CI (k6, con checks de que la posición se guarda).

**Causa:** el controller declara el body como un tipo inline (`{ lat: number; lng: number }`), no como una clase DTO. El `ValidationPipe` necesita una clase para saber qué validar, así que deja pasar el body sin tocarlo. Y `updateLocation` no mira el estado del viaje. Este es el caso que muestra el límite de la cobertura: `trips.service.ts` tiene 100 % de decisiones, pero `updateLocation` no tiene ninguna decisión sobre los datos, así que no había nada que cubrir.

---

## 2. Litros de combustible al cerrar el viaje: `fuelLiters`

**Requisito RF-06:** al cerrar el viaje, el transportista puede informar los litros usados. Es opcional, pero si viene, tiene que ser un número positivo de hasta 100.000 (`CompleteTripDto`: `@IsOptional @IsNumber @IsPositive @Max(100000)`).

| Clase | Tipo |
|---|---|
| EQ-1: ausente | Válida (se guarda `null`) |
| EQ-2: número ≤ 0 | Inválida |
| EQ-3: número en (0, 100 000] | Válida |
| EQ-4: número > 100 000 | Inválida |
| EQ-5: no numérico (incluye `"85"` como texto) | Inválida |

| ID | Clase / límite | Valor | Esperado | Obtenido (DTO) | Estado |
|---|---|---|---|---|---|
| CP-FUEL-01 | EQ-1 | ausente | Acepta | Acepta | ✅ |
| CP-FUEL-02 | EQ-2 | -1 | Rechaza | Rechaza: *must be a positive number* | ✅ |
| CP-FUEL-03 | EQ-2, límite | 0 | Rechaza | Rechaza: *must be a positive number* | ✅ |
| CP-FUEL-04 | EQ-3, primer válido | 0,01 | Acepta | Acepta | ✅ |
| CP-FUEL-05 | EQ-3, típico | 85,5 | Acepta | Acepta | ✅ |
| CP-FUEL-06 | EQ-3, anterior al límite | 99 999,99 | Acepta | Acepta | ✅ |
| CP-FUEL-07 | EQ-3, límite | 100 000 | Acepta | Acepta | ✅ |
| CP-FUEL-08 | EQ-4, primer inválido | 100 000,01 | Rechaza | Rechaza: *must not be greater than 100000* | ✅ |
| CP-FUEL-09 | EQ-5 | `"abc"` | Rechaza | Rechaza | ✅ |
| CP-FUEL-10 | EQ-5 | `"85"` | Rechaza: la API recibe JSON con números | Rechaza | ✅ |

Que el valor llegue al service se verifica en `trips.controller.spec.ts` › `completeTrip` (*passes the fuelLiters from the body…* y *passes undefined when fuelLiters is omitted…*), y que se guarde, en `trips.service.spec.ts` › *stores null fuelLiters when none is provided*.

**Observación:** el límite de 100.000 litros es muy holgado. Un camión con acoplado carga entre 600 y 1.000 litros, así que un error de tipeo de un cero de más pasaría la validación. Queda como sugerencia, no como defecto, porque el requisito no fija un máximo.

---

## 3. Puntaje de la calificación: `score`

**Requisito RF-09:** el dador califica al transportista con un entero de 1 a 5 (`CreateRatingDto`: `@IsInt @Min(1) @Max(5)`).

| ID | Clase / límite | Valor | Esperado | Obtenido (DTO) | Estado |
|---|---|---|---|---|---|
| CP-CAL-01 | Inválida, último afuera abajo | 0 | Rechaza | Rechaza: *La puntuación mínima es 1* | ✅ |
| CP-CAL-02 | Límite inferior | 1 | Acepta | Acepta | ✅ |
| CP-CAL-03 | Típico | 3 | Acepta | Acepta | ✅ |
| CP-CAL-04 | Límite superior | 5 | Acepta | Acepta | ✅ |
| CP-CAL-05 | Inválida, primero afuera arriba | 6 | Rechaza | Rechaza: *La puntuación máxima es 5* | ✅ |
| CP-CAL-06 | No entero | 3,5 | Rechaza | Rechaza: *debe ser un número entero* | ✅ |
| CP-CAL-07 | No numérico | `"4"` | Rechaza | Rechaza | ✅ |
| CP-CAL-08 | Ausente | — | Rechaza | Rechaza | ✅ |

---

## 4. Ciclo de vida del viaje: transición de estados y tabla de decisión

**Requisitos RF-04 y RF-06:** solo el transportista asignado inicia y cierra su viaje, y solo desde el estado anterior que corresponde.

### Diagrama de estados

```
 el dador acepta              PATCH start             PATCH complete           el dador
 la postulación ──▶ ACCEPTED ──────────▶ IN_PROGRESS ─────────────▶ COMPLETED ──▶ POST /ratings
                 carga ASSIGNED        carga IN_TRANSIT          carga DELIVERED  (una vez)
                                              ▲
                                              │
                               PATCH location ┘ (solo en este estado, RF-05)
```

El enum `TripStatus` también tiene `PENDING` y `CANCELLED`, pero ningún endpoint del módulo lleva a esos estados. Es una brecha del requisito (no se puede cancelar un viaje aceptado), no un defecto del código.

### Tabla de decisión: `PATCH /trips/:id/start`

| Condición / Regla | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| El viaje existe | N | S | S | S | S |
| Rol `TRANSPORTER` | — | N | S | S | S |
| Es el transportista asignado | — | — | N | S | S |
| Estado = `ACCEPTED` | — | — | — | N | S |
| **Acción** | 404 | 403 | 403 | 400 | 200: viaje `IN_PROGRESS`, carga `IN_TRANSIT`, `startedAt` |

| ID | Regla | Automatizado en (`trips.service.spec.ts` › `startTrip`, salvo aclaración) | Estado |
|---|---|---|---|
| CP-EST-01 | R1 | `findById` › *throws NotFoundException when the trip does not exist* | ✅ |
| CP-EST-02 | R2 | `RolesGuard` (`@Roles('TRANSPORTER')`). Mismo guard verificado en CP-LOC-13 | ✅ |
| CP-EST-03 | R3 | *throws ForbiddenException when the trip belongs to another carrier* | ✅ |
| CP-EST-04 | R4 | *throws BadRequestException when the trip is not ACCEPTED* | ✅ |
| CP-EST-05 | R5 | *sets trip IN_PROGRESS + load IN_TRANSIT in a transaction*; E2E paso 5 | ✅ |

### Tabla de decisión: `PATCH /trips/:id/complete`

| Condición / Regla | R1 | R2 | R3 | R4 | R5 | R6 |
|---|---|---|---|---|---|---|
| Es el transportista asignado | N | S | S | S | S | S |
| Estado = `IN_PROGRESS` | — | N | S | S | S | S |
| OSRM responde a tiempo con una ruta | — | — | S | S | N | N |
| Viene `fuelLiters` | — | — | S | N | S | N |
| **Acción** | 403 | 400 | 200, distancia y litros | 200, distancia, litros `null` | 200, distancia `null`, litros | 200, los dos `null` |

En R3 a R6 el viaje pasa a `COMPLETED` y la carga a `DELIVERED`: **la caída de OSRM nunca impide cerrar el viaje** (contingencia).

| ID | Regla | Automatizado en | Estado |
|---|---|---|---|
| CP-EST-06 | R1 | `trips.service.spec.ts` › `completeTrip` › *throws ForbiddenException…* | ✅ |
| CP-EST-07 | R2 | › *throws BadRequestException when the trip is not IN_PROGRESS* | ✅ |
| CP-EST-08 | R3 | › *fetches OSRM distance and stores it with the provided fuelLiters*; integración › *stores the OSRM route distance…*; E2E paso 7 contra OSRM real | ✅ |
| CP-EST-09 | R4 | › *stores null fuelLiters when none is provided* | ✅ |
| CP-EST-10 | R5 (OSRM con error) | › *stores null distance when OSRM fails*; integración › *completes the trip with null distance when OSRM returns an error* | ✅ |
| CP-EST-11 | R5 (OSRM no responde) | Integración › *completes the trip with null distance when OSRM never answers* y *aborts the OSRM request once the timeout elapses* (regresión de #155) | ✅ |
| CP-EST-12 | R6 | Combinación de CP-EST-09 y CP-EST-10. No tiene test propio; las dos condiciones son independientes en el código | ⏳ |

### Transiciones inválidas

| ID | Estado de partida | Acción | Esperado | Cubierto por | Estado |
|---|---|---|---|---|---|
| CP-EST-13 | `IN_PROGRESS` | start | 400 | CP-EST-04 (prueba con un estado distinto de `ACCEPTED`) | ✅ |
| CP-EST-14 | `COMPLETED` | start | 400 | Misma condición que CP-EST-13 | ✅ |
| CP-EST-15 | `ACCEPTED` | complete | 400 | CP-EST-07 | ✅ |
| CP-EST-16 | `COMPLETED` | complete | 400 | Misma condición que CP-EST-15 | ✅ |
| CP-EST-17 | `COMPLETED` | location | 400 | CP-LOC-12 | ❌ #170 |

---

## 5. Quién puede calificar: tabla de decisión

**Requisito RF-09:** solo el dador de la carga califica al transportista, una vez por viaje y solo con el viaje cerrado. Lo decide `RatingsService.create`, y la pantalla del viaje muestra el botón con la misma regla (`canRate`).

| Condición / Regla | R1 | R2 | R3 | R4 | R5 | R6 |
|---|---|---|---|---|---|---|
| El viaje existe | N | S | S | S | S | S |
| Estado = `COMPLETED` | — | N | S | S | S | S |
| El autor es el dador de la carga | — | — | N | S | S | S |
| El transportista es el mismo usuario que el dador | — | — | — | S | N | N |
| Ya calificó este viaje | — | — | — | — | S | N |
| **Acción** | 404 | 400 | 403 | 400 | 409 | 201: calificación del dador al transportista |

| ID | Regla | Automatizado en | Estado |
|---|---|---|---|
| CP-CAL-09 | R1 | `ratings.service.spec.ts` › *throws NotFoundException when the trip does not exist* | ✅ |
| CP-CAL-10 | R2 | › *throws BadRequestException when the trip is not COMPLETED* | ✅ |
| CP-CAL-11 | R3 (es el transportista) | › *throws ForbiddenException when the carrier (transporter) tries to rate*; pantalla › *does not let the carrier rate a completed trip* | ✅ |
| CP-CAL-12 | R3 (es un tercero) | › *throws ForbiddenException when fromUser is neither carrier nor shipper of the trip* | ✅ |
| CP-CAL-13 | R4 | › *throws BadRequestException when the user would rate themselves* | ✅ |
| CP-CAL-14 | R5 | › *throws ConflictException when the shipper already rated this trip*; pantalla › *hides the rating entry when the shipper already rated*; además, unique `(tripId, fromUserId)` en la base | ✅ |
| CP-CAL-15 | R6 | › *creates a rating when the shipper rates a completed trip*; pantalla › *lets the shipper rate the carrier…*; E2E paso 8 | ✅ |

El test de pantalla de CP-CAL-11 es el que estaba desactualizado en #154: esperaba que el transportista también pudiera calificar, una regla que se había cambiado.

---

## Resumen

| Área | Casos | ✅ | ❌ | ⏳ |
|---|---|---|---|---|
| Ubicación (CP-LOC) | 16 | 8 | 8 | 0 |
| Combustible (CP-FUEL) | 10 | 10 | 0 | 0 |
| Calificación (CP-CAL) | 15 | 15 | 0 | 0 |
| Estados (CP-EST) | 17 | 15 | 1 | 1 |
| **Total** | **58** | **48** | **9** | **1** |

Los 9 casos que fallan corresponden a un solo defecto, [#170](https://github.com/CargoLink-proyecto-final/CargoLink/issues/170). Todos los encontró el diseño de casos de caja negra. Ninguno lo había detectado la suite automatizada, que da 100 % de decisiones en el service.
