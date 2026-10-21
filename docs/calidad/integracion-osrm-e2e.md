# Integración externa (OSRM) y flujo E2E post-deploy

Parte del TP de Calidad de Software sobre el módulo de viajes (`trips`). Documenta la integración externa del módulo y cómo se prueba en cada nivel, hasta el flujo E2E que corre el pipeline después de cada deploy a dev (meta de Nivel 3: "Flujo E2E automatizado en cada despliegue").

## La integración

| | |
|---|---|
| Sistema externo | [OSRM](https://project-osrm.org/) (Open Source Routing Machine), servidor público `https://router.project-osrm.org` |
| Para qué | Calcular la distancia por ruta de un viaje al cerrarlo (`Trip.distanceKm`). Alimenta las métricas de combustible del transportista. |
| Dónde | `fetchRouteDistanceKm` en [`backend/src/common/routing.ts`](../../backend/src/common/routing.ts), llamada desde `TripsService.completeTrip` |
| Contrato | `GET /route/v1/driving/{lngO},{latO};{lngD},{latD}?overview=false` → `{ code: "Ok", routes: [{ distance: <metros> }] }` |
| Configuración | `OSRM_URL` (default: servidor público) y `OSRM_TIMEOUT_MS` (default 5000) |
| SLA | Ninguno: servidor público, best-effort, con rate limit |

### Contingencia

Si OSRM no responde, responde con error o tarda más que `OSRM_TIMEOUT_MS`, la función devuelve `null` y el viaje **se cierra igual**, con la distancia sin calcular. La métrica de combustible simplemente no suma ese viaje. El timeout se agregó al corregir el defecto #155: antes, un OSRM que aceptaba la conexión y no respondía dejaba colgado el cierre del viaje.

## Cómo se prueba, por nivel

| Nivel | Prueba | Contra qué | Cuándo corre |
|---|---|---|---|
| Unitaria | `trips.service.spec.ts` | `fetchRouteDistanceKm` mockeado | CI, en cada push y PR |
| Integración | [`trips-osrm.integration.spec.ts`](../../backend/src/trips/trips-osrm.integration.spec.ts) | OSRM falso: servidor HTTP local que responde bien, con error o nunca | CI, en cada push y PR |
| Smoke | [`deploy/vps/smoke.sh`](../../deploy/vps/smoke.sh) | Entorno desplegado, solo lectura | Después de cada deploy (dev y prod) |
| **E2E** | [`deploy/vps/e2e-trips.mjs`](../../deploy/vps/e2e-trips.mjs) | **Entorno dev desplegado + OSRM real** | Después de cada deploy a dev |

En el CI la integración se prueba siempre con dobles, nunca contra el servidor público: los runners de GitHub correrían en cada push, y OSRM no es nuestro. Contra OSRM real va solo el E2E, una vez por deploy.

## Flujo E2E post-deploy

Recorre el ciclo completo del módulo por la API pública, igual que la app:

| # | Paso | Verifica |
|---|---|---|
| 1 | Login del dador y del transportista | Auth JWT |
| 2 | El dador publica una carga Córdoba → Villa Carlos Paz | Carga en `PUBLISHED` |
| 3 | El transportista se postula al precio publicado | Guard de perfil aprobado + compatibilidad del vehículo |
| 4 | El dador acepta la postulación | Se crea el viaje en `ACCEPTED` |
| 5 | El transportista inicia el viaje | Viaje en `IN_PROGRESS` |
| 6 | El transportista reporta su ubicación | `currentLat`/`currentLng` guardados |
| 7 | El transportista cierra el viaje | Viaje en `COMPLETED` y **`distanceKm` > 0 calculado por OSRM real** |
| 8 | El dador ve el viaje cerrado y lo califica | Carga en `DELIVERED`, calificación creada |

**Criterio de aceptación (fijado antes de ejecutar):** los 8 pasos pasan. Si OSRM no responde, el paso 7 falla aunque el viaje se haya cerrado: la contingencia funcionó, pero la integración no, y eso es lo que el E2E tiene que mostrar.

Cada paso imprime su tiempo. El resultado queda en el log y en el *job summary* del workflow **Deploy to VPS**.

### Cuentas y datos

El E2E escribe datos (una carga, una postulación, un viaje y una calificación por corrida), así que **solo corre contra dev**, nunca contra prod. Las cargas llevan el prefijo `[E2E]` en el título.

Usa dos cuentas que crea el seed ([`backend/prisma/seed-e2e.ts`](../../backend/prisma/seed-e2e.ts)) **solo si el entorno define `E2E_PASSWORD`**:

- `e2e-shipper@cargolink.test` (CARGO_GENERATOR)
- `e2e-carrier@cargolink.test` (TRANSPORTER, con perfil completo, vehículo y documentos ya aprobados)

Hacen falta porque el registro normal exige verificar el mail y que el admin apruebe los documentos del transportista. `E2E_PASSWORD` va solo en el `.env` de `~/cargolink-dev`. En prod no se define, y entonces las cuentas no existen.

Con `E2E_PASSWORD` definida, el smoke también usa `e2e-carrier` para sus checks autenticados, salvo que el `.env` tenga `SMOKE_EMAIL`/`SMOKE_PASSWORD` propios.

### Cómo correrlo

**En el pipeline:** `deploy.sh dev` lo corre solo, después del smoke, dentro del contenedor del backend, porque el host del VPS no tiene por qué tener node. Si el `.env` no tiene `E2E_PASSWORD`, el paso se saltea y queda marcado como omitido en el resumen. Si un paso falla, el deploy queda en rojo.

**A mano (un comando):**

```bash
# contra dev
E2E_PASSWORD=... node deploy/vps/e2e-trips.mjs https://dev.cargolink.com.ar

# contra el stack local (levantado con E2E_PASSWORD para que el seed cree las cuentas)
E2E_PASSWORD=algo docker compose up -d --build
docker compose exec -T backend node --input-type=module - http://localhost:3001 < deploy/vps/e2e-trips.mjs
```

Solo necesita Node 20 (usa `fetch`). No tiene dependencias.

## Resultados

### Primera corrida local (2026-10-21)

Stack de docker compose en la notebook de desarrollo:

```
  ok   login del dador y del transportista (179 ms)
  ok   el dador publica una carga (22 ms)
  ok   el transportista se postula al precio publicado (35 ms)
  ok   el dador acepta y se crea el viaje (28 ms)
  ok   el transportista inicia el viaje (20 ms)
  ok   el transportista reporta su ubicación (15 ms)
  FAIL el transportista cierra el viaje y OSRM calcula la distancia (365 ms)
       — distanceKm vino null: OSRM no respondió (se aplicó la contingencia)
```

Los pasos 1 a 6 pasan. El 7 falla por el entorno, no por el código: el Docker Desktop local no tenía salida a internet desde los contenedores (`ETIMEDOUT` hacia OSRM y `ENOTFOUND` incluso hacia example.com), mientras que desde el host OSRM respondía 200. Sirvió para comprobar dos cosas: el viaje se cierra igual cuando OSRM no está (contingencia de #155) y el E2E detecta y reporta ese caso en vez de darlo por bueno.

### En dev

Pendiente de la primera corrida en el VPS, que necesita `E2E_PASSWORD` en el `.env` de `~/cargolink-dev`.
