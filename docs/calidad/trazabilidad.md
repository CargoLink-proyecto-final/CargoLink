# Trazabilidad: requisito → caso de prueba → defecto

Parte del [plan de pruebas](plan-de-pruebas.md) (v1.0, 2026-10-23). Une cada requisito del módulo `trips` con los casos que lo verifican y con los defectos que se encontraron. Sirve en las dos direcciones: un requisito sin caso es un hueco de prueba, y un defecto sin requisito indica un requisito implícito que no estaba escrito.

Los casos `CP-*` están en [`casos-de-prueba.md`](casos-de-prueba.md). Los tests se nombran como `archivo › describe › it`.

## 1. Matriz

### Requisitos funcionales

| ID | Requisito | Casos y pruebas | Nivel | Defectos |
|---|---|---|---|---|
| RF-01 | El admin puede forzar la aceptación de una carga publicada, lo que crea un viaje `ACCEPTED` y pasa la carga a `ASSIGNED`. | `trips.service.spec.ts` › `acceptLoad` (3 tests: carga inexistente, carga no publicada, transacción OK); `trips.controller.spec.ts` › `acceptLoad` | Unitario | — |
| RF-02 | Cada rol lista sus viajes, paginados y filtrables por estado: el admin todos, el transportista los suyos y el dador los de sus cargas. | `trips.service.spec.ts` › `findAll` (6 tests); `trips.controller.spec.ts` › `findAll`, `findMyTrips`, `findMyLoadTrips`; smoke: `GET /trips/my` sin token → 401 y con token → 200 | Unitario, smoke | — |
| RF-03 | El detalle del viaje (con teléfonos y ubicación) lo ven solo el dador de la carga, el transportista asignado y el admin. | `trips.service.spec.ts` › `findByIdForUser` (5 tests); **`trips-access.integration.spec.ts`** (200 a las partes y al admin, 403 a otro transportista y a otro dador, sin filtrar el teléfono); pantalla › *fetches the trip by id and renders detail*, *shows the not-found state* | Unitario, integración | **#161** (IDOR) |
| RF-04 | El transportista asignado inicia su viaje `ACCEPTED`: pasa a `IN_PROGRESS` y la carga a `IN_TRANSIT`. | CP-EST-01 a 05, CP-EST-13 y 14; pantalla › *starts the trip for the carrier on an ACCEPTED trip*, *does not show start/complete actions for a non-carrier viewer*; E2E paso 5 | Unitario, E2E | — |
| RF-05 | El transportista asignado reporta la posición del camión (lat/lng válidas) mientras el viaje está en curso. | **CP-LOC-01 a 16**, CP-EST-17; `trips.service.spec.ts` › `updateLocation` (7 tests); `update-location.dto.spec.ts` (6 tests); E2E paso 6; k6 `stress` y `soak` | Unitario, caja negra, E2E, carga | **#170** (cerrado) |
| RF-06 | El transportista asignado cierra su viaje `IN_PROGRESS` con litros opcionales (0 < litros ≤ 100.000). El viaje pasa a `COMPLETED` y la carga a `DELIVERED`. | CP-EST-06 a 12, CP-EST-15 y 16; CP-FUEL-01 a 10; pantalla › *completes an IN_PROGRESS trip with fuel liters from the modal*; E2E paso 7 | Unitario, caja negra, E2E | — |
| RF-07 | Al cerrar el viaje, el backend calcula la distancia por ruta con OSRM. **Contingencia:** si OSRM falla, tarda más de 5 s o no hay ruta, se guarda distancia `null` y el viaje se cierra igual. | CP-EST-08, 10 y 11; **`trips-osrm.integration.spec.ts`** (4 tests con OSRM falso); `routing.ts` al 100 % de decisiones; **E2E paso 7 contra OSRM real** | Unitario, integración, E2E | **#155** (sin timeout), **#168** (happy eyeballs) |
| RF-08 | El transportista ve sus métricas de combustible y puntualidad, calculadas solo sobre viajes `COMPLETED`. | `trips.service.spec.ts` › `getCarrierMetrics` (4 tests); `trips.controller.spec.ts` › `getMyMetrics`; smoke: `GET /trips/metrics` sin token → 401 y con token → 200 | Unitario, smoke | — |
| RF-09 | El dador de la carga califica al transportista con un entero de 1 a 5, una vez por viaje y solo con el viaje `COMPLETED`. | **CP-CAL-01 a 15**; `ratings.service.spec.ts` › `create` (8 tests); pantalla › *lets the shipper rate…*, *hides the rating entry…*, *does not let the carrier rate…*; E2E paso 8 | Unitario, caja negra, E2E | **#154** (test desactualizado) |

### Requisitos no funcionales

| ID | Requisito | Casos y pruebas | Nivel | Defectos |
|---|---|---|---|---|
| RNF-01 | **Desempeño del tracking:** con 50 usuarios simultáneos, `PATCH /location` responde con menos de 1 % de error, p95 < 500 ms y p99 < 1000 ms. | k6 `stress` en cada CI (umbrales en `tests/k6/trips-location.js`) | Carga | — |
| RNF-02 | **Estabilidad:** el mismo endpoint mantiene esos umbrales con carga sostenida, sin fugas de memoria ni de conexiones. | k6 `soak`, 20 VUs durante 10 min ([run 39602779633](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39602779633)) | Carga | — |
| RNF-03 | **Disponibilidad después de cada deploy:** el frontend y la API responden, y los endpoints protegidos exigen token. | Smoke (`deploy/vps/smoke.sh`) en dev y prod | Smoke | — |
| RNF-04 | **Integración externa en el entorno real:** el ciclo completo funciona en dev contra OSRM real. | E2E post-deploy, 8 pasos | E2E | **#168** |
| RNF-05 | **Build reproducible:** el build no depende de recursos de red que puedan fallar. | Build en cada CI y en cada deploy | CI | **#160** |
| RNF-06 | **Seguridad:** la API no expone detalles internos en los errores. | CP-LOC-09 | Caja negra | **#170** (el 500 incluye el detalle de Prisma) |

### Huecos

- **RF-01** no tiene prueba por HTTP: el `RolesGuard` que lo restringe al admin se verifica en otros endpoints (CP-LOC-13), no en este.
- **CP-EST-12** (cerrar sin litros con OSRM caído) no tiene test propio. Las dos condiciones se cubren por separado.
- **RNF-06** se probó en un solo endpoint. Es probable que otros endpoints sin DTO tengan el mismo problema; queda fuera del alcance (`trips`).

## 2. Defectos

| Issue | Defecto | Requisito | Detectado por | Severidad | Fix | Rojo → verde | Regresión | Estado |
|---|---|---|---|---|---|---|---|---|
| [#154](https://github.com/CargoLink-proyecto-final/CargoLink/issues/154) | El test "Calificar Viaje" esperaba la regla vieja (el transportista también calificaba) | RF-09 | Primera corrida del CI (#152) | Media | #153 | [39355651783](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39355651783) → CI verde 416/416 | `page.test.tsx` › *does not let the carrier rate a completed trip* (CP-CAL-11) | Cerrado |
| [#155](https://github.com/CargoLink-proyecto-final/CargoLink/issues/155) | El cierre del viaje se colgaba si OSRM aceptaba la conexión y no respondía (`fetch` sin timeout) | RF-07 | Revisión del plan de contingencia | Alta | #156 | 586fc97 (rojo local) → [39486757526](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39486757526) | `trips-osrm.integration.spec.ts` › *…when OSRM never answers*, *aborts the OSRM request once the timeout elapses* (CP-EST-11) | Cerrado |
| [#160](https://github.com/CargoLink-proyecto-final/CargoLink/issues/160) | Build intermitente: `next/font/google` descargaba las fuentes en cada build | RNF-05 | CI en `develop` ([run 39494453152](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39494453152)) y un deploy a dev | Media | #165 | — | El build de cada CI y de cada deploy. No hay test unitario: el defecto era de red en tiempo de build | Cerrado |
| [#161](https://github.com/CargoLink-proyecto-final/CargoLink/issues/161) | IDOR: `GET /trips/:id` devolvía cualquier viaje a cualquier usuario autenticado, con teléfonos y ubicación | RF-03 | Revisión de código al armar el E2E | Alta | #163 | [39604337363](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39604337363) (403 esperado, 200 obtenido) → [39606736017](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39606736017) | `trips-access.integration.spec.ts` (5 casos) | Cerrado |
| [#168](https://github.com/CargoLink-proyecto-final/CargoLink/issues/168) | Desde el VPS, Node 20 cortaba el connect a OSRM a los 250 ms (happy eyeballs) y el viaje se cerraba siempre sin distancia | RF-07, RNF-04 | **E2E post-deploy, paso 7** | Media | #166 | [39617516989 (intento 2)](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39617516989/attempts/2) → [39639648761](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39639648761) | E2E paso 7 en cada deploy a dev. No se reproduce en el CI, cuyo connect es más rápido | Cerrado |
| [#170](https://github.com/CargoLink-proyecto-final/CargoLink/issues/170) | `PATCH /location` acepta coordenadas fuera de rango, `null`, campos de más y viajes cerrados, y devuelve 500 con el detalle de Prisma ante un tipo inválido | RF-05, RNF-06 | **Casos de caja negra** (valores límite) | Media | [PR #173](https://github.com/CargoLink-proyecto-final/CargoLink/pull/173) | CP-LOC-05 a 12 en dev: 200/500 el 23/10 → 400 el 25/10, tras el deploy [40239410412](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/40239410412) | `update-location.dto.spec.ts` (rango, tipo, `null`, faltantes); `trips.service.spec.ts` › `updateLocation` › *throws BadRequestException when the trip is …* (CP-LOC-12, CP-EST-17) | Cerrado |

### Lectura

- **Los defectos salieron de actividades distintas:** el CI encontró #154 y #160; la revisión de la contingencia, #155; la revisión de código, #161; el E2E, #168, y el diseño de casos de caja negra, #170. Las pruebas de integración son las que verifican las correcciones de #155 y #161. Ninguna actividad habría encontrado todo por sí sola.
- **Los seis defectos están cerrados y tienen su regresión automatizada en el pipeline.** #154, #155, #161 y #170 tienen tests de jest que corren en cada CI. #160 se cubre con el build y #168 con el E2E post-deploy: los dos dependen del entorno, no de la lógica, y un test unitario no los reproduciría.
- **Densidad de defectos:** el código de producción del alcance (`trips`, `ratings` y `routing.ts`) suma 458 líneas sin comentarios ni líneas en blanco (442 antes de la corrección de #170, que agregó el DTO y el chequeo de estado). Tres defectos están en ese código (#155, #161 y #170): **6,6 defectos por KLOC**. Los otros tres no cuentan: #154 era del test, y #160 y #168, de configuración del build y del runtime.
