# Capturas de evidencia — calidad

Capturas del pipeline, de SonarCloud y de GitHub Issues tomadas del 20 al 25/10: el antes y después de #153 (fix del test "Calificar Viaje"), el E2E rojo y verde en dev, el contraste rojo/verde de #161, el stress con k6, el análisis final de SonarCloud y el registro de defectos. Cada una se puede rastrear a su corrida o análisis, así los números del informe coinciden con los del pipeline.

## Antes — commit `6a1b039` (merge de #152)

| Archivo | Qué muestra | Fuente |
|---|---|---|
| `2026-10-20-ci-rojo-resumen.jpg` | CI con Frontend en rojo; Backend y SonarCloud en verde; cobertura backend | [run 39355651783](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39355651783) |
| `2026-10-20-ci-rojo-frontend-test-fallido.jpg` | Test fallido en `trips/[id]/page.test.tsx`: no encuentra el botón "Calificar Viaje" | mismo run, job Frontend |
| `2026-10-20-ci-rojo-frontend-totales.jpg` | `1 failed, 414 passed, 415 total` | mismo run, job Frontend |
| `2026-10-20-sonarcloud-develop-gate.jpg` | Quality gate Passed; Security/Reliability/Maintainability A; cobertura 84,5 % | SonarCloud, rama `develop` |
| `2026-10-20-sonarcloud-develop-metricas.jpg` | Cobertura 84,5 % sobre 262 líneas, duplicación 0 %, dependency risks 238 (C) | SonarCloud, rama `develop` |

## Después — commit `18e2a74` (merge de #153)

| Archivo | Qué muestra | Fuente |
|---|---|---|
| `2026-10-20-ci-verde-resumen.jpg` | CI con los 3 jobs en verde | [run 39491475554](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39491475554) |
| `2026-10-20-ci-verde-frontend-totales.jpg` | `416 passed, 416 total` y resumen de cobertura frontend | mismo run, job Frontend |
| `2026-10-20-sonarcloud-develop-gate-despues.jpg` | Quality gate Passed; cobertura 87,0 % | SonarCloud, rama `develop` |

## Integración externa, smoke y E2E (deploy a dev)

| Archivo | Qué muestra | Fuente |
|---|---|---|
| `2026-10-21-deploy-dev-e2e-rojo.jpg` | Smoke 7/7 en verde y E2E en rojo en el paso 7: `distanceKm` null porque OSRM no respondía desde el VPS (defecto #168) | [run 39617516989, intento 2](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39617516989/attempts/2) |
| `2026-10-25-deploy-dev-smoke-e2e-verde.jpg` | Smoke 7/7 y E2E 8/8 en 4,0 s, con 36,5 km calculados por OSRM real, sobre `f17176e` | [run 40239410412](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/40239410412) |

## Defecto #161 (IDOR): rojo y verde en el CI

| Archivo | Qué muestra | Fuente |
|---|---|---|
| `2026-10-21-ci-rojo-acceso-403.jpg` | `trips-access.integration.spec.ts` en rojo: *Expected: 403, Received: 200* para otro transportista y otro dador | [run 39604337363](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39604337363), job Backend |
| `2026-10-21-ci-verde-acceso.jpg` | Los cuatro jobs del CI en verde con el fix de #163 | [run 39606736017](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39606736017) |

## Cierre — commit `f17176e` (merge de #173), 2026-10-25

| Archivo | Qué muestra | Fuente |
|---|---|---|
| `2026-10-25-ci-verde-resumen.jpg` | CI con los cuatro jobs en verde y la cobertura del backend (89,3 % sentencias, 92,2 % ramas) | [run 40239410504](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/40239410504) |
| `2026-10-25-ci-k6-stress.jpg` | Stress con k6: 6.018 requests, 50 VUs, p95 10,9 ms, 0 % de error y los cuatro umbrales en verde | mismo run, job *Stress · k6* |
| `2026-10-25-sonarcloud-develop-final.jpg` | Quality gate Passed; A/A/A con 0 issues; cobertura 87,9 %; duplicación 0,0 % | SonarCloud, rama `develop` |
| `2026-10-25-sonarcloud-develop-codigo-nuevo.jpg` | Vista *New Code*: cobertura 100 % sobre 22 líneas nuevas (exigido ≥ 80 %), 0 issues nuevos, 0 % de duplicación | SonarCloud, rama `develop` |

## Registro de defectos

| Archivo | Qué muestra | Fuente |
|---|---|---|
| `2026-10-25-issues-defectos.jpg` | Los 6 issues con la etiqueta `bug`, todos cerrados | GitHub Issues |
| `2026-10-25-issue-170.jpg` | Issue #170 con la plantilla de defecto: módulo, tipo, severidad, prioridad, detectado por, versión, pasos, esperado y obtenido | [#170](https://github.com/CargoLink-proyecto-final/CargoLink/issues/170) |

La cobertura de SonarCloud se mide solo sobre el módulo `trips` (262 líneas el 20/10, 279 el 25/10), por eso no es comparable directo con la cobertura global del backend.
