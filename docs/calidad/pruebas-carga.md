# Pruebas de carga (k6) y smoke test post-deploy

Parte del TP de Calidad de Software sobre el módulo de viajes (`trips`). Cubre las pruebas de **stress** y **esfuerzo sostenido** con k6 y el **smoke test** que corre el pipeline después de cada despliegue.

## Qué se prueba y por qué

**Endpoint bajo carga:** `PATCH /api/trips/:id/location`. Es el de más tráfico del módulo: cada transportista con un viaje en curso manda su posición GPS cada pocos segundos, y escribe en la tabla `trips` en cada llamada.

**Lo que no se prueba bajo carga:** el cierre del viaje (`PATCH /trips/:id/complete`), porque llama a OSRM. OSRM es un servidor público con rate limit, y estresarlo sería abusar de un servicio de terceros. Esa integración se cubre con dobles HTTP en `backend/src/trips/trips-osrm.integration.spec.ts` (ver #155) y contra OSRM real en el E2E post-deploy ([`integracion-osrm-e2e.md`](./integracion-osrm-e2e.md)).

## Criterios de aceptación (fijados antes de ejecutar)

Están como `thresholds` en [`tests/k6/trips-location.js`](../../tests/k6/trips-location.js). Si alguno se cruza, k6 sale con código distinto de 0 y el job del CI queda en rojo.

| Métrica | Umbral | Justificación |
|---|---|---|
| Tasa de error en `location` | < 1 % | Una posición perdida degrada el tracking, pero la siguiente la reemplaza. |
| p95 de latencia en `location` | < 500 ms | La app manda la posición cada pocos segundos; medio segundo no se percibe en el mapa. |
| p99 de latencia en `location` | < 1000 ms | Acota la cola larga para que no se acumulen requests del mismo celular. |
| Checks OK (status 200 y posición guardada) | > 99 % | Verifica que la respuesta sea correcta, no solo rápida. |

## Perfiles

| Perfil | Forma | Uso |
|---|---|---|
| `stress` (default) | 0 → 40 % de `MAX_VUS` en 30 s, meseta de 1 min, sube a `MAX_VUS` (50) en 30 s, meseta de 1 min, baja a 0 en 20 s. Total ≈ 3,5 min. | Corre en cada CI. Busca degradación al pasar de carga normal a pico. |
| `soak` | 40 % de `MAX_VUS` sostenido durante `SOAK_DURATION` (10 min por defecto). | Esfuerzo sostenido: fugas de memoria o de conexiones a la DB. Se lanza a mano desde Actions. |
| `quick` | 5 VUs durante 20 s. | Verificar que el script funciona. |

Cada usuario virtual manda una posición por segundo (`sleep(1)`), más seguido que la app real, para generar más presión por usuario.

## Datos de prueba

El viaje `IN_PROGRESS` lo crea [`backend/prisma/k6-fixture.ts`](../../backend/prisma/k6-fixture.ts) directo en la DB y devuelve su id. No se arma por API porque el transportista necesita el perfil completo y aprobado (documentos, CUIT, licencia) para postularse, y eso no es lo que mide la prueba. Usa las cuentas demo del seed (`shipper@example.com` y `carrier@example.com`).

El script se niega a correr contra `plataforma.cargolink.com.ar`, porque producción tiene datos reales.

## Cómo correrlo

### En el pipeline

El job **`Stress · k6 sobre tracking de viajes`** de [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) corre en cada push y en cada PR a `develop`, en runners de GitHub:

1. Levanta Postgres 15 como *service* del job (DB descartable).
2. Build del backend, `prisma migrate deploy`, seed y arranque.
3. Fixture → `TRIP_ID`.
4. k6 (`grafana/k6:0.54.0`) con el perfil `stress`.
5. Publica la tabla de resultados en el *job summary* y sube `k6-results/` como artefacto `k6-stress` (30 días).

**Esfuerzo sostenido:** Actions → CI → *Run workflow* → `k6_profile = soak` (y opcionalmente `soak_duration`). El artefacto queda como `k6-soak`.

> El job **no** es un status check requerido: mide un runner compartido de GitHub, cuyos tiempos varían entre corridas. Si un umbral falla, queda en rojo y se ve en el PR, pero no bloquea el merge.

### Local (un comando)

Con el stack levantado (`docker compose up -d --build`):

```bash
tests/k6/run-local.sh            # stress
tests/k6/run-local.sh soak       # esfuerzo sostenido (SOAK_DURATION=10m)
tests/k6/run-local.sh quick      # verificación rápida
MAX_VUS=100 tests/k6/run-local.sh
```

El fixture corre dentro del contenedor del backend, así usa la DB de compose aunque haya otro Postgres escuchando en el 5432 del host. Los resultados quedan en `k6-results/` (ignorado por git).

## Resultados

### Primera corrida en el pipeline (2026-10-20)

Perfil `stress` en `ubuntu-latest` ([run 39488546108](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39488546108), rama `test/trips-k6-smoke`):

| Métrica | Valor |
|---|---|
| Requests | 5.990 (29,8 req/s) |
| VUs máximos | 50 |
| Latencia media | 10,5 ms |
| p90 | 17,5 ms |
| p95 | 19,3 ms |
| p99 | 22,8 ms |
| Máxima | 74,5 ms |
| Tasa de error | 0,00 % |
| Checks OK | 100 % (11.978/11.978) |

Los cuatro umbrales pasan.

### Línea base local (2026-10-20)

Perfil `stress`, stack de docker compose en la notebook de desarrollo (Windows + Docker Desktop):

| Métrica | Valor |
|---|---|
| Requests | 5.956 (29,7 req/s) |
| VUs máximos | 50 |
| Latencia media | 15,6 ms |
| p90 | 19,5 ms |
| p95 | 21,9 ms |
| Máxima | 111,7 ms |
| Tasa de error | 0,00 % |
| Checks OK | 100 % (11.910/11.910) |

Los cuatro umbrales pasan con mucho margen: el p95 es 23 veces menor que el límite. A 50 VUs el endpoint no se degrada, porque cada request es un `findUnique` más un `update` por clave primaria.

**Para el informe:** los números que valen son los del *job summary* del CI (la consigna pide que coincidan con el pipeline). Este local sirve como referencia.

### Esfuerzo sostenido en el pipeline (2026-10-21)

Perfil `soak` en `ubuntu-latest`, lanzado a mano desde Actions sobre `develop` ([run 39602779633](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39602779633), `soak_duration=10m`): 20 VUs (40 % de `MAX_VUS`) sostenidos durante 11 min 30 s, contando la rampa.

| Métrica | Resultado | Umbral | |
|---|---|---|---|
| Requests a `location` | 12.736 (18,5 req/s) | — | |
| Tasa de error | 0,00 % (0 de 12.736) | < 1 % | ✅ |
| p95 | 16,94 ms | < 500 ms | ✅ |
| p99 | 20,60 ms | < 1000 ms | ✅ |
| Latencia media / máxima | 11,59 ms / 67,34 ms | — | |
| Checks OK | 100 % (25.472 de 25.472) | > 99 % | ✅ |

Los cuatro umbrales pasan. La latencia no crece a lo largo de la corrida: el p95 del soak (16,9 ms) es del mismo orden que el del stress (19,3 ms con 50 VUs). No aparecen señales de fuga de memoria ni de conexiones a la DB en 10 minutos de carga constante.

El primer intento ([run 39601790852](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39601790852)) quedó cancelado a los pocos minutos. Lo canceló el CI que disparó un merge a `develop`, porque los dos compartían el grupo de concurrencia. Se corrigió en #162, que pasó a separar el grupo por evento.

### Pendiente

- Subir `MAX_VUS` hasta encontrar el punto de quiebre (dónde el p95 cruza los 500 ms), para tener un límite de capacidad documentado.

---

## Smoke test post-deploy

[`deploy/vps/smoke.sh`](../../deploy/vps/smoke.sh) verifica el módulo trips en un entorno ya desplegado. Es **solo lectura** (no crea ni modifica datos), así que es seguro contra prod.

| Check | Esperado |
|---|---|
| Frontend `/trips` | 200 |
| `GET /api/trips/my` sin token | 401 |
| `GET /api/trips/metrics` sin token | 401 |
| `PATCH /api/trips/:id/location` sin token | 401 |
| Login con la cuenta de smoke¹ | token |
| `GET /api/trips/my` con token¹ | 200 |
| `GET /api/trips/metrics` con token¹ | 200 |

¹ Solo si el `.env` del entorno define `SMOKE_EMAIL` y `SMOKE_PASSWORD` (una cuenta `TRANSPORTER`). Sin esas variables esos checks se omiten y se avisa en el resumen.

**En el pipeline:** `deploy.sh` lo corre después del healthcheck (paso 6b), en cada deploy a dev y a prod. Si falla, el job de deploy queda en rojo y el resumen indica qué check falló. No hace rollback automático; para eso, ver [`../deployment.md`](../deployment.md) § Rollback.

**A mano:**

```bash
deploy/vps/smoke.sh https://dev.cargolink.com.ar
SMOKE_EMAIL=... SMOKE_PASSWORD=... deploy/vps/smoke.sh https://dev.cargolink.com.ar
```

Primera ejecución manual contra dev (2026-10-20): los 4 checks sin autenticación dieron OK.

> **Bloqueante:** el runner self-hosted `ubuntu-tesis01` está **offline**. Hasta que se levante, el smoke no corre solo en los deploys. Hay que levantarlo en el VPS y forzar un deploy a dev para tener la primera ejecución automática.
