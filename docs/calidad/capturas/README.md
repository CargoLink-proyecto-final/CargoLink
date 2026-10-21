# Capturas de evidencia — calidad

Capturas del pipeline y de SonarCloud tomadas el 2026-10-20, antes y después de mergear #153 (fix del test "Calificar Viaje"). Cada una se puede rastrear a su corrida o análisis, así los números del informe coinciden con los del pipeline.

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

La cobertura de SonarCloud se mide solo sobre el módulo `trips` (262 líneas), por eso no es comparable directo con la cobertura global del backend.
