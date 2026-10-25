# Plan de pruebas: módulo de viajes (`trips`)

Parte del TP Integrador de Calidad de Software sobre el TFG CargoLink. Este documento es el punto de entrada: define qué se prueba, cómo, dónde y con qué criterio se da por terminado. El detalle vive en los documentos que enlaza.

| | |
|---|---|
| Versión | **1.1** |
| Fecha | 2026-10-25 |
| Nivel declarado | **Nivel 3, prototipo avanzado** |
| Línea de código de referencia | `develop` @ `f17176e` |
| Tracker de defectos | GitHub Issues, etiqueta `bug` |

### Historial de versiones

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2026-10-23 | Primera versión. Junta lo hecho del 19 al 22/10 (CI, SonarCloud, k6, smoke, E2E) y agrega riesgos, trazabilidad y casos de prueba con técnicas de caja negra. |
| 1.1 | 2026-10-25 | Cierra #170 ([PR #173](https://github.com/CargoLink-proyecto-final/CargoLink/pull/173)) y vuelve a ejecutar los casos CP-LOC en dev. Actualiza la cobertura del módulo (94,4 % y 100 %), los criterios de salida al 25/10 y los datos de SonarCloud: 87,9 % de cobertura y 100 % sobre el código nuevo, con lo que S4 queda cumplido. |

El documento está versionado en git: cada cambio entra por PR y queda en el historial de `docs/calidad/plan-de-pruebas.md`.

### Documentos relacionados

| Documento | Contenido |
|---|---|
| [`calidad-iso25010-metricas-herramienta.md`](calidad-iso25010-metricas-herramienta.md) | Matriz ISO/IEC 25010 y top 3, métricas interpretadas, objetivos de calidad, contingencia y herramienta nueva (k6) con matriz de decisión |
| [`riesgos.md`](riesgos.md) | Riesgos del módulo, probabilidad × impacto, priorizados |
| [`trazabilidad.md`](trazabilidad.md) | Requisito → caso de prueba → defecto |
| [`casos-de-prueba.md`](casos-de-prueba.md) | Clases de equivalencia, valores límite y tablas de decisión |
| [`integracion-osrm-e2e.md`](integracion-osrm-e2e.md) | Integración externa (OSRM), contingencia y E2E post-deploy |
| [`pruebas-carga.md`](pruebas-carga.md) | Stress y soak con k6, smoke post-deploy |
| [`sonarcloud-setup.md`](sonarcloud-setup.md) | Análisis estático y quality gate |
| [`capturas/`](capturas/) | Evidencia antes/después del CI y de SonarCloud |

---

## 1. Alcance

**Dentro del alcance**

| Componente | Ubicación |
|---|---|
| API de viajes | `backend/src/trips/` (controller, service, DTO) |
| Integración externa con OSRM | `backend/src/common/routing.ts`, llamada desde `TripsService.completeTrip` |
| Calificación del viaje (paso final del ciclo) | `backend/src/ratings/` |
| Pantalla de detalle del viaje | `frontend/src/app/trips/[id]/` |

Endpoints: `POST /trips/accept/:loadId`, `GET /trips`, `GET /trips/my`, `GET /trips/my-loads`, `GET /trips/metrics`, `GET /trips/:id`, `PATCH /trips/:id/start`, `PATCH /trips/:id/complete`, `PATCH /trips/:id/location`, y `POST /ratings` para el viaje cerrado.

**Fuera del alcance**

- El resto de los módulos (cargas, postulaciones, usuarios, documentos, pagos). Se ejercitan solo como precondición del E2E, sin verificarlos.
- La app mobile.
- Pruebas de carga contra OSRM: es un servidor público con rate limit, y cargarlo sería un abuso. El k6 apunta solo a `PATCH /trips/:id/location`.
- Pruebas de usabilidad y de compatibilidad entre navegadores.

## 2. Objetivos

| Objetivo | Cómo se mide | Meta |
|---|---|---|
| Que cada cambio compile, pase los tests y el análisis estático antes de llegar a `develop` | Jobs del CI en cada PR | 100 % de los PRs con CI verde antes del merge |
| Cobertura del código del módulo | Reporte de jest (artefacto `coverage-backend`) y SonarCloud | ≥ 80 % de sentencias y de decisiones, en código existente y nuevo |
| Que el ciclo completo funcione en el entorno desplegado | E2E post-deploy en dev | 8 de 8 pasos en cada deploy |
| Que el tracking aguante el pico de uso | k6 `stress` en cada CI | Error < 1 %, p95 < 500 ms, p99 < 1000 ms |
| Que no se degrade con carga sostenida | k6 `soak` (a mano) | Mismos umbrales durante 10 min |
| Que todo defecto encontrado quede registrado y con regresión | Issues con `bug` | 100 % con pasos, esperado y obtenido; los corregidos, con su prueba de regresión |

## 3. Estrategia: niveles y técnicas

### Pirámide de pruebas del módulo

```
                 ┌───────────┐
                 │ Carga k6  │   1 script, 2 perfiles (stress en cada CI, soak a mano)
                ┌┴───────────┴┐
                │  E2E (API)  │  8 pasos, OSRM real, después de cada deploy a dev
               ┌┴─────────────┴┐
               │     Smoke     │ 7 checks en dev, 4 en prod, después de cada deploy
             ┌─┴───────────────┴─┐
             │    Integración    │ 9 tests: HTTP real con Nest + OSRM falso
         ┌───┴───────────────────┴───┐
         │         Unitarias         │ 70 tests backend + 9 de la pantalla (jest)
         └───────────────────────────┘
```

| Nivel | Qué prueba | Archivos | Contra qué | Cuándo |
|---|---|---|---|---|
| Unitario | Reglas de negocio del service, delegación del controller, reglas de calificación, render y acciones de la pantalla | `trips.service.spec.ts` (38), `trips.controller.spec.ts` (12), `ratings.service.spec.ts` (14), `trips/dto/update-location.dto.spec.ts` (6), `frontend/src/app/trips/[id]/page.test.tsx` (9) | Prisma y OSRM mockeados | Cada push y PR (CI) |
| Integración | Control de acceso por HTTP (#161) y llamada real por red a un OSRM falso (responde bien, con error o nunca) | `trips-access.integration.spec.ts` (5), `trips-osrm.integration.spec.ts` (4) | App Nest levantada en un puerto + servidor HTTP local | Cada push y PR (CI) |
| Smoke | Que el entorno desplegado responda, que los endpoints exijan token y que con login devuelvan 200 | `deploy/vps/smoke.sh` | dev (7 checks) y prod (4: los de login se omiten porque prod no tiene cuenta de prueba) | Después de cada deploy |
| E2E | Ciclo completo por la API: carga → postulación → viaje → ubicación → cierre con OSRM real → calificación | `deploy/vps/e2e-trips.mjs` | dev + OSRM real | Después de cada deploy a dev |
| Carga | Latencia y errores de `PATCH /trips/:id/location` con 50 usuarios virtuales (stress) y con 20 sostenidos (soak) | `tests/k6/trips-location.js` | Backend + Postgres efímeros en el runner | Stress en cada CI; soak a mano |
| Estático | Bugs, vulnerabilidades, code smells, duplicación, cobertura | SonarCloud | Todo el repo | Cada push y PR (CI) |

Las pruebas siguen la estructura **AAA** (Arrange, Act, Assert): preparan los mocks, llaman una sola vez y verifican. La estructura está **marcada con comentarios** en 12 de los 88 tests del módulo: los de control de acceso (#161) y los más nuevos de `trips.service.spec.ts`. Marcar el resto es una mejora pendiente de forma, no de contenido.

### Técnicas de diseño

| Técnica | Dónde se aplica | Documento |
|---|---|---|
| Clases de equivalencia y valores límite (caja negra) | lat/lng de `PATCH /location`, `fuelLiters` del cierre, `score` de la calificación | [`casos-de-prueba.md`](casos-de-prueba.md) §1–3 |
| Tabla de decisión | Transiciones de estado (iniciar y cerrar) y quién puede calificar | [`casos-de-prueba.md`](casos-de-prueba.md) §4–5 |
| Transición de estados | Ciclo `ACCEPTED → IN_PROGRESS → COMPLETED` del viaje y de la carga | [`casos-de-prueba.md`](casos-de-prueba.md) §4 |
| Cobertura de sentencia y de decisión (caja blanca) | Todo el módulo, medida por jest en cada CI | §7 de este documento |
| Basada en riesgos | Qué se prueba primero y con qué profundidad | [`riesgos.md`](riesgos.md) |

## 4. Entorno

| Entorno | Para qué | Datos |
|---|---|---|
| Runner de GitHub (`ubuntu-latest`) | CI: lint, build, unitarias, integración, SonarCloud, k6 | Prisma mockeado en unitarias; Postgres efímero de servicio para k6 con el fixture `backend/prisma/k6-fixture.ts` |
| dev (`https://dev.cargolink.com.ar`) | Smoke y E2E post-deploy | Cuentas `e2e-shipper` y `e2e-carrier`, creadas por el seed solo si el `.env` define `E2E_PASSWORD`. Las cargas del E2E llevan el prefijo `[E2E]` |
| prod (`https://plataforma.cargolink.com.ar`) | Solo smoke, de solo lectura | Ninguno: el E2E no corre en prod porque escribe datos, y el smoke no tiene cuenta para los checks con login |
| Local (docker compose) | Reproducir defectos y correr todo a mano | El mismo seed |

Los entornos desplegados corren en un VPS propio con Docker y Cloudflare Tunnel. El deploy lo hace un runner self-hosted (`cargolink-vps`) con `deploy/vps/deploy.sh`: build, migraciones, healthcheck, smoke y, en dev, E2E. Herramientas: Node 20, jest, k6, SonarCloud, GitHub Actions, GitHub Issues y Docker.

## 5. Criterios de entrada

Para empezar a probar un cambio:

1. Está en un PR contra `develop`. Nadie pushea directo.
2. El código compila (`npm run build`) y pasa el lint.
3. Si el cambio corrige un defecto, el issue existe y tiene pasos, esperado y obtenido.
4. Para el smoke y el E2E: el deploy a dev terminó y el healthcheck respondió.

## 6. Criterios de salida

Un cambio se puede mergear, y el módulo se da por probado, cuando se cumple todo esto:

| # | Criterio | Fuente | Estado al 2026-10-25 |
|---|---|---|---|
| S1 | CI verde: lint, build, unitarias e integración | GitHub Actions | ✅ 645/645 backend, 418/418 frontend ([run 40239410504](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/40239410504)) |
| S2 | Quality gate de SonarCloud en *Passed* | SonarCloud | ✅ Passed |
| S3 | Cobertura del módulo ≥ 80 % de sentencias y de decisiones | Artefacto `coverage-backend` | ✅ Ver §7 |
| S4 | Cobertura del código nuevo ≥ 80 % | SonarCloud, *New Code* | ✅ 100 % (análisis de `develop` @ `f17176e`, [captura](capturas/2026-10-25-sonarcloud-develop-final.jpg)) |
| S5 | k6 `stress` con los cuatro umbrales en verde | Job *Stress · k6* | ✅ |
| S6 | Smoke y E2E 8/8 en verde después del deploy a dev | *Deploy to VPS* | ✅ [run 40239410412](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/40239410412) |
| S7 | Sin defectos abiertos de severidad alta en el módulo | GitHub Issues | ✅ No queda ningún defecto abierto: los de severidad alta (#155, #161) y el último de severidad media (#170, [PR #173](https://github.com/CargoLink-proyecto-final/CargoLink/pull/173)) están cerrados |

**Limitación conocida:** el repo es privado y la organización no tiene GitHub Pro, así que no se pueden activar *branch protection* ni *rulesets* (la API devuelve 403). El CI y el gate de SonarCloud **informan** en cada PR, pero GitHub no bloquea el merge. Se compensa con la regla de equipo de no mergear con checks en rojo.

### Suspensión y reanudación

- Se suspenden las pruebas contra dev si el host no responde o si el smoke falla en los checks de solo lectura: un E2E sobre un entorno caído no aporta información. Se reanudan con el siguiente deploy verde.
- Si OSRM público está caído, el E2E falla en el paso 7 y se registra la corrida, pero no bloquea el trabajo en el CI, que nunca usa el servidor real.

## 7. Cobertura del módulo

Números del artefacto `coverage-backend` del CI sobre `develop` @ `f17176e`, con la corrección de #170 incluida ([run 40239410504](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/40239410504)):

| Archivo | Sentencias | Decisiones (ramas) | Funciones |
|---|---|---|---|
| `trips/trips.service.ts` | 100 % (60/60) | **100 % (25/25)** | 100 % (11/11) |
| `trips/trips.controller.ts` | 100 % (32/32) | sin ramas | 100 % (10/10) |
| `trips/dto/complete-trip.dto.ts` | 100 % (4/4) | sin ramas | — |
| `trips/dto/update-location.dto.ts` | 100 % (5/5) | sin ramas | — |
| `trips/trips.module.ts` | 0 % (0/6) | sin ramas | — |
| **Módulo `trips` (backend)** | **94,4 % (101/107)** | **100 % (25/25)** | **100 % (21/21)** |
| `common/routing.ts` (OSRM) | 100 % (15/15) | 100 % (8/8) | 100 % (1/1) |
| `ratings/ratings.service.ts` | 100 % (25/25) | 100 % (7/7) | 100 % (4/4) |
| `frontend/src/app/trips/[id]/page.tsx` | 94,2 % (65/69) | 76,2 % (48/63) | 92,3 % (24/26) |

`trips.module.ts` queda en 0 % porque es solo la declaración del módulo de Nest, que los tests reemplazan por un `TestingModule`. No tiene lógica.

SonarCloud mide la cobertura con su propio criterio (líneas más condiciones, sobre backend y frontend del módulo juntos): marcó **84,5 % antes y 87,0 % después** de las correcciones del día 2, y **87,9 %** en el análisis de `f17176e` (25/10), con 100 % sobre el código nuevo. Por eso no coincide con el número de jest, y el informe aclara de cuál de las dos fuentes sale cada cifra.

**Lectura crítica:** el 100 % de decisiones de `trips.service.ts` no impidió el defecto [#170](https://github.com/CargoLink-proyecto-final/CargoLink/issues/170). `updateLocation` no tenía ninguna rama para validar coordenadas o estado, así que no había decisión que cubrir. Lo encontró el diseño de casos de caja negra con valores límite. La cobertura mide qué código se ejecutó, no qué requisitos se verificaron. La corrección agregó justamente la decisión que faltaba (el chequeo de estado), y la validación de rango y tipo vive en el DTO, que la cobertura de ramas tampoco ve: por eso su regresión son tests de validación propios y no un número de cobertura.

## 8. Gestión de defectos

1. Todo defecto se registra como issue con la etiqueta `bug`, usando la plantilla del Anexo B.
2. Severidad (impacto en el usuario) y prioridad (urgencia de arreglarlo) se asignan por separado.
3. El fix entra por PR, que referencia al issue.
4. Cuando se puede, primero se commitea el test que reproduce el defecto (rojo) y después el fix (verde). Los dos runs quedan linkeados en el issue.
5. El issue se cierra con el run verde que lo verifica.

Defectos registrados hasta ahora: ver [`trazabilidad.md`](trazabilidad.md) §2.

## 9. Cómo correr todo

Cada nivel se corre con un solo comando:

| Nivel | Comando |
|---|---|
| Unitarias + integración, backend, con cobertura | `cd backend && npx jest --coverage` |
| Unitarias, frontend, con cobertura | `cd frontend && npx jest --coverage` |
| Solo el módulo de viajes | `cd backend && npx jest src/trips src/ratings src/common/routing` |
| Carga (stress) contra un stack local | `bash tests/k6/run-local.sh` |
| Carga (soak) en el pipeline | Actions → *CI* → *Run workflow* con `k6_profile=soak` |
| Smoke contra un entorno | `bash deploy/vps/smoke.sh https://dev.cargolink.com.ar` |
| E2E contra dev | `E2E_PASSWORD=… node deploy/vps/e2e-trips.mjs https://dev.cargolink.com.ar` |
| Todo el pipeline | Abrir un PR contra `develop` (CI) y mergearlo (deploy + smoke + E2E) |

## 10. Cronograma y responsables

| Día | Fecha | Trabajo | Resultado |
|---|---|---|---|
| 1 | 19–20/10 | CI + SonarCloud, línea base | #152; primer CI rojo real (#154) |
| 2 | 20/10 | k6 + smoke + defectos | #153, #156, #158 |
| 3 | 21/10 | E2E post-deploy, soak, defectos rojo/verde | #159, #162, #163, #164, #165 |
| 4 | 21–22/10 | E2E y smoke autenticado en dev | #166 (defecto #168); E2E 8/8 |
| 5 | 23–25/10 | Plan, riesgos, trazabilidad, casos, ISO 25010, informe | Este documento y los enlazados |
| Demo | 26/10 | Deploy en vivo + ensayo | — |

| Rol | Responsabilidad |
|---|---|
| A | CI, SonarCloud, métricas e ISO 25010 |
| B | Unitarias AAA, pruebas dinámicas, defectos rojo/verde |
| C | Integración OSRM, smoke/E2E post-deploy, k6, runner |

## 11. Entregables

- Este plan y los documentos enlazados, en `docs/calidad/`.
- Reportes del pipeline como artefactos de cada run: `coverage-backend`, `coverage-frontend`, `k6-stress` / `k6-soak`, y el *job summary* del deploy con smoke y E2E.
- Issues de defectos con su trazabilidad.
- Informe final en PDF.

---

## Anexo A: plantilla de caso de prueba

| Campo | Contenido |
|---|---|
| ID | `CP-<área>-<nn>`, por ejemplo `CP-LOC-03` |
| Requisito | ID de [`trazabilidad.md`](trazabilidad.md), por ejemplo `RF-05` |
| Técnica | Clase de equivalencia / valor límite / tabla de decisión / transición de estado |
| Precondición | Estado del sistema antes de ejecutar (rol logueado, estado del viaje) |
| Entrada | Datos exactos |
| Pasos | Lo mínimo para reproducirlo |
| Resultado esperado | Fijado **antes** de ejecutar |
| Resultado obtenido | Lo que pasó, con fecha y entorno |
| Estado | ✅ pasa / ❌ falla (con issue) / ⏳ no ejecutado |
| Automatizado en | Archivo y nombre del test, si existe |

## Anexo B: plantilla de defecto

Es la que usan los issues #154 a #170:

```markdown
## Defecto
Qué falla y dónde (archivo, función, endpoint).

| Campo | Valor |
|---|---|
| Módulo | |
| Tipo | Funcional / validación / seguridad / robustez / configuración |
| Severidad | Alta / Media / Baja, con el porqué (impacto en el usuario) |
| Prioridad | Alta / Media / Baja, con el porqué (urgencia) |
| Detectado por | Qué prueba o actividad lo encontró, y la fecha |
| Versión | rama @ commit |

## Pasos para reproducir
1. …

## Resultado esperado
## Resultado obtenido
## Criterio de aceptación
## Trazabilidad
- **Requisito:**
- **Casos de prueba:** (marcando cuál es el de regresión)
- **Fix:** PR y commits
- **Verificación (rojo → verde):** run rojo y run verde
```
