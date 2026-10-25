# Calidad de CargoLink: ISO/IEC 25010, métricas, herramienta nueva y fundamentos

Parte del TP Integrador de Calidad de Software sobre el TFG CargoLink. Completa el [plan de pruebas](plan-de-pruebas.md) (v1.0, 2026-10-23) con lo que el plan dejó para el día 5: la matriz ISO/IEC 25010, las métricas interpretadas, la incorporación de la herramienta nueva y los fundamentos (objetivos de calidad, siete principios, QA vs QC y mapa de herramientas).

| | |
|---|---|
| Versión | **1.0** |
| Fecha | 2026-10-25 |
| Nivel declarado | **Nivel 3, prototipo avanzado** |
| Alcance | Módulo de viajes (`trips`), igual que el plan de pruebas |
| Fuentes de los números | Runs de GitHub Actions, SonarCloud, GitHub Issues y los documentos de `docs/calidad/`. Cada cifra indica de dónde sale |

## Índice

1. [Objetivos de calidad y prácticas que los sostienen](#1-objetivos-de-calidad-y-prácticas-que-los-sostienen)
2. [Plan de contingencia ante la caída de dependencias críticas](#2-plan-de-contingencia-ante-la-caída-de-dependencias-críticas)
3. [Los siete principios del testing aplicados a CargoLink](#3-los-siete-principios-del-testing-aplicados-a-cargolink)
4. [Matriz ISO/IEC 25010](#4-matriz-isoiec-25010)
5. [Top 3 de características](#5-top-3-de-características)
6. [Métricas interpretadas](#6-métricas-interpretadas)
7. [Prácticas de QA y de QC](#7-prácticas-de-qa-y-de-qc)
8. [Mapa de herramientas](#8-mapa-de-herramientas)
9. [Herramienta nueva: k6, con el proceso de cinco pasos](#9-herramienta-nueva-k6-con-el-proceso-de-cinco-pasos)
10. [Metas del Nivel 3: cumplidas y no cumplidas](#10-metas-del-nivel-3-cumplidas-y-no-cumplidas)

---

## 1. Objetivos de calidad y prácticas que los sostienen

Cada objetivo se mide con un dato que ya produce el pipeline o el tracker. No hay objetivos de "que ande bien".

### Desde el usuario

| ID | Objetivo | Métrica | Meta | Resultado | Fuente |
|---|---|---|---|---|---|
| OU-1 | El transportista puede cerrar su viaje aunque falle el servicio de rutas | Viajes que se cierran con OSRM caído o lento | 100 %, con respuesta en ≤ 5 s | ✅ Cumple. Probado con un OSRM falso que no responde | `trips-osrm.integration.spec.ts`, #155 |
| OU-2 | El dador ve la posición del camión sin demora perceptible | p95 de `PATCH /trips/:id/location` con 50 usuarios simultáneos | < 500 ms | ✅ 19,3 ms | k6 `stress`, [run 39488546108](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39488546108) |
| OU-3 | Nadie ve los datos de un viaje ajeno (teléfonos, ubicación) | Respuestas 403 a usuarios que no son parte del viaje | 100 % | ✅ 5 de 5 casos | `trips-access.integration.spec.ts`, #161 |

### Desde el equipo

| ID | Objetivo | Métrica | Meta | Resultado | Fuente |
|---|---|---|---|---|---|
| OE-1 | Ningún cambio llega a `develop` sin pasar las pruebas | PRs mergeados con CI verde | 100 % | ✅ en la práctica. Sin *branch protection* (ver R3) | GitHub Actions |
| OE-2 | El código del módulo está cubierto por pruebas | Cobertura de sentencias y de decisiones | ≥ 80 % | ✅ 93,9 % y 100 % | Artefacto `coverage-backend`, [run 39639648905](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39639648905) |
| OE-3 | Los defectos graves se corrigen rápido y no vuelven | Tiempo de corrección (§6.2) y defectos cerrados con prueba de regresión | < 24 h; 100 % | ✅ 8,9 h de media; 5 de 5 | GitHub Issues, [`trazabilidad.md`](trazabilidad.md) §2 |

### Desde la organización (el proyecto como producto)

| ID | Objetivo | Métrica | Meta | Resultado | Fuente |
|---|---|---|---|---|---|
| OO-1 | Cada versión desplegada queda verificada sin intervención manual | Deploys con smoke automático | 100 % | ✅ Healthcheck y smoke en dev y prod; E2E en dev | `deploy/vps/deploy.sh` paso 6 |
| OO-2 | Los datos de producción se pueden recuperar | Backup antes de cada deploy a prod y copias diarias | 1 por deploy; 14 copias | ✅ | [`../deployment.md`](../deployment.md) § Backups, riesgo R9 |
| OO-3 | La plataforma no depende de un único proveedor de nube | Tiempo para mudar el deploy a otra infraestructura | Mudanza sin cambiar código de la app | ✅ Se mudó de GCP a un VPS propio el 2026-09-13/14 | [`../decision-deploy-vps.md`](../decision-deploy-vps.md) |

### Prácticas de proceso que sostienen estos objetivos

| Práctica | Qué objetivo sostiene |
|---|---|
| Gitflow: todo entra por PR contra `develop`; nadie commitea directo en `develop` ni en `main` | OE-1 |
| CI en cada push y PR: lint, build, tests con cobertura, SonarCloud y k6 | OE-1, OE-2, OU-2 |
| Defecto → issue con plantilla → test rojo → fix → test verde → cierre con el run verde | OE-3 |
| Smoke y E2E dentro de `deploy.sh`: el deploy queda en rojo si fallan | OO-1 |
| Backup automático antes de cada deploy a prod; el deploy aborta si el backup falla | OO-2 |
| Decisiones de arquitectura escritas en `docs/` (por ejemplo `decision-deploy-vps.md`) | OO-3 |
| Conventional commits validados por un hook y revisión de QA antes de abrir cada PR | OE-1 |

---

## 2. Plan de contingencia ante la caída de dependencias críticas

| Dependencia | Qué pasa si se cae | Contingencia | Cómo se verificó |
|---|---|---|---|
| **OSRM** (servicio externo de rutas, sin SLA) | No se puede calcular la distancia del viaje | Timeout de 5 s (`OSRM_TIMEOUT_MS`). La distancia queda en `null` y **el viaje se cierra igual**: la métrica de combustible no suma ese viaje. La URL es configurable (`OSRM_URL`), así que se puede apuntar a otro servidor OSRM sin tocar código | Integración con un OSRM falso que responde bien, con error o nunca (#155). E2E con OSRM real en cada deploy a dev (#168). Detalle en [`integracion-osrm-e2e.md`](integracion-osrm-e2e.md) |
| **El VPS** (un único host para dev y prod) | Se cae toda la plataforma | Reinicio automático de contenedores y del túnel; healthcheck en cada deploy; backup diario con `pg_dump` (14 copias); imágenes `:previous` para volver atrás sin rebuild; `deploy.sh` se puede correr a mano si el runner está caído | Cortes de red reales el 30/09, el 19/10 y el 20/10 (riesgo R9). Plan de mudanza a otro proveedor en preparación |
| **Runner self-hosted** | Los deploys no se disparan solos | `deploy/vps/deploy.sh` se corre a mano por SSH (es el plan B documentado en el propio script) | El runner estuvo offline el 20/10 ([`pruebas-carga.md`](pruebas-carga.md) § Smoke) |
| **SonarCloud** | El job de análisis queda en rojo | El CI de backend y frontend (lint, build, tests, cobertura) es independiente y sigue informando. El análisis se reintenta en el siguiente push | Jobs separados en `ci.yml` |

---

## 3. Los siete principios del testing aplicados a CargoLink

| # | Principio | Cómo se vio en el proyecto |
|---|---|---|
| 1 | **Las pruebas muestran la presencia de defectos, no su ausencia** | `trips.service.ts` tiene 100 % de cobertura de decisiones, y aun así existe el defecto #170: `updateLocation` acepta coordenadas imposibles. La cobertura dice qué código se ejecutó, no que el código esté bien. |
| 2 | **Las pruebas exhaustivas son imposibles** | No se pueden probar todas las coordenadas posibles. Se eligieron clases de equivalencia y valores límite (−90, 90, −180, 180 y uno más afuera de cada borde) en [`casos-de-prueba.md`](casos-de-prueba.md), y la profundidad se decidió por riesgo ([`riesgos.md`](riesgos.md)). |
| 3 | **Probar temprano ahorra tiempo y dinero** | El CI corre en cada PR, antes del merge. Cada defecto se reprodujo primero con un test en rojo y después se corrigió. El IDOR #161 se encontró en revisión de código, antes de que algún usuario lo explotara. |
| 4 | **Los defectos se agrupan** | 4 de los 6 defectos están en el borde del sistema con el entorno o con terceros: #155 y #168 en la llamada a OSRM, #160 en el build y #170 en la entrada de datos sin validar. La lógica interna del service casi no tuvo defectos. Por eso se reforzaron la integración y el E2E. |
| 5 | **Paradoja del pesticida** (repetir las mismas pruebas deja de encontrar defectos) | Las unitarias, que ya pasaban, no encontraron ni #168 ni #170. Hicieron falta técnicas nuevas: el E2E en el entorno real encontró #168 y los casos de caja negra encontraron #170. |
| 6 | **Las pruebas dependen del contexto** | OSRM es un servidor público: no se le hace prueba de carga y en el CI se usan dobles. El E2E escribe datos, así que corre solo en dev. En prod corre solo el smoke, que es de solo lectura. |
| 7 | **Falacia de la ausencia de errores** | El test #154 verificaba una regla vieja (que el transportista también calificaba). Un sistema que pasa todas sus pruebas pero cumple una regla equivocada no le sirve al usuario: las pruebas tienen que seguir al requisito vigente, que es que solo califica el dador. |

---

## 4. Matriz ISO/IEC 25010

Se usa el modelo de calidad de producto de **ISO/IEC 25010:2011**, con sus 8 características, que es el que pide la consigna. La revisión de 2023 agrega *protección (safety)* y renombra algunas características; no cambia el análisis.

**Estado:** ✅ evaluada con evidencia · ⚠️ evaluada en parte · ❌ no evaluada (fuera del alcance).
**Prioridad:** sale de la matriz de riesgos (exposición P × I) y de los defectos encontrados.

| # | Característica | Subcaracterísticas evaluadas | Qué significa en CargoLink | Evidencia | Resultado | Defectos | Estado | Prioridad |
|---|---|---|---|---|---|---|---|---|
| 1 | **Adecuación funcional** | Completitud, corrección | El ciclo carga → postulación → viaje → tracking → cierre → calificación hace lo que dicen las reglas de negocio | 9 requisitos funcionales trazados a casos ([`trazabilidad.md`](trazabilidad.md)); 75 tests del módulo; casos de caja negra CP-LOC, CP-FUEL, CP-EST y CP-CAL; E2E 8/8 en dev | Todos los requisitos tienen al menos un caso; E2E verde ([run 39639648761](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39639648761)) | #154 (cerrado), #170 (abierto, media) | ✅ | **Alta** |
| 2 | **Eficiencia de desempeño** | Comportamiento temporal, capacidad | El endpoint de tracking responde rápido con muchos camiones reportando a la vez | k6 `stress` (50 VUs) en cada CI y `soak` (20 VUs, 10 min) con umbrales fijados antes | Stress: p95 19,3 ms, 0 % error. Soak: p95 16,9 ms, 0 % error. Umbral: 500 ms | — | ⚠️ No se buscó el punto de quiebre (capacidad máxima) | Media |
| 3 | **Compatibilidad** | Interoperabilidad, coexistencia | Intercambiar datos con OSRM; que web y mobile usen la misma API; que dev y prod convivan en el mismo host | Contrato de OSRM documentado y probado con dobles y con OSRM real; API única documentada con Swagger; dev y prod como proyectos compose separados en el mismo VPS | La integración funciona en el entorno real después del fix | #168 (cerrado) | ⚠️ Compatibilidad entre navegadores fuera del alcance | Media |
| 4 | **Usabilidad** | Protección contra errores del usuario, accesibilidad | Que el usuario no pueda cargar datos inválidos y que la interfaz sea usable | Validación de DTOs en el backend (`ValidationPipe` con `whitelist`); validación de formularios en el frontend (zod); 52 atributos `aria-*` en el frontend | No hubo pruebas con usuarios ni auditoría de accesibilidad | — | ❌ Fuera del alcance del plan | Baja |
| 5 | **Fiabilidad** | Tolerancia a fallos, disponibilidad, recuperabilidad | La plataforma sigue funcionando si falla un tercero, y se recupera si se cae el host | Contingencia de OSRM con timeout; healthcheck + smoke en cada deploy; backups diarios (14 copias) y antes de cada deploy a prod; rollback con imágenes `:previous` | El viaje se cierra con OSRM caído; los deploys desde el 19/10 fueron verdes en 10 de 11 | #155, #168 (cerrados) | ✅ | **Alta** |
| 6 | **Seguridad** | Confidencialidad, autenticidad, integridad | Solo las partes del viaje ven teléfonos y ubicación; solo usuarios autenticados operan | JWT + bcrypt; guard de roles; chequeo de ownership; 5 tests de integración de acceso; el smoke verifica 401 sin token; SonarCloud Security **A** | IDOR corregido y con regresión. SonarCloud marca **238 riesgos en dependencias (calificación C)** sin tratar | #161 (cerrado, alta), #170 (abierto: el 500 expone el detalle de Prisma) | ⚠️ Faltan dependencias y el endpoint de #170 | **Alta** |
| 7 | **Mantenibilidad** | Modularidad, analizabilidad, capacidad de prueba | El código es fácil de entender, cambiar y probar | SonarCloud Maintainability **A**; duplicación **0 %**; ESLint en el CI; TypeScript estricto en el frontend; módulos NestJS con inyección de dependencias que se mockean en los tests | Cobertura de sentencias 93,9 % y de decisiones 100 % en el backend del módulo | — | ✅ | Media |
| 8 | **Portabilidad** | Adaptabilidad, instalabilidad, reemplazabilidad | La app corre en cualquier host con Docker y se configura sin tocar código | `docker compose up -d` levanta todo; configuración por variables de entorno (`OSRM_URL`, etc.); migración de GCP Cloud Run a un VPS propio sin cambiar la app | Mudanza realizada el 2026-09-13/14 | #160 (cerrado: el build dependía de descargar fuentes) | ✅ | Baja |

### Lectura de la matriz

- **5 de las 8 características tienen evidencia completa o parcial medida por el pipeline.** Las tres con huecos están declaradas: falta el punto de quiebre de la eficiencia, la compatibilidad entre navegadores quedó afuera y la usabilidad no se evaluó.
- **Los 6 defectos caen en 5 características:** fiabilidad (#155, #168), seguridad (#161, #170), adecuación funcional (#154, #170), compatibilidad (#168) y portabilidad (#160). #168 y #170 cuentan en dos. Ninguno cayó en mantenibilidad, que es la característica que el análisis estático vigila en cada push.
- **El hallazgo más importante que todavía no se atacó:** los 238 riesgos en dependencias que reporta SonarCloud. No se reflejan en la calificación de seguridad del código (A), porque son de librerías de terceros. Es la principal deuda de seguridad del proyecto.

---

## 5. Top 3 de características

El criterio fue cruzar dos datos: qué riesgos tienen **exposición alta (6)** en [`riesgos.md`](riesgos.md) y dónde aparecieron los **defectos reales**. No es una elección por intuición.

| Puesto | Característica | Riesgos de exposición alta | Defectos | Por qué es crítica para CargoLink |
|---|---|---|---|---|
| 1 | **Fiabilidad** | R1 (OSRM caído), R2 (el entorno se comporta distinto que el CI), R9 (caída del host) | #155, #168 | Un viaje en curso es mercadería en la ruta. Si el cierre se cuelga o el tracking se cae, el dador pierde visibilidad y el viaje no se puede cobrar ni calificar. Además dependemos de un servicio externo sin SLA y de un único host. |
| 2 | **Seguridad** | R4 (acceso a un viaje ajeno) | #161 (alta), #170 | La plataforma maneja teléfonos, ubicación en tiempo real de camiones y montos de fletes. Una filtración expone a personas reales y destruye la confianza entre dadores y transportistas. El único defecto de severidad alta que afectaba datos fue de seguridad. |
| 3 | **Adecuación funcional** | R5 y R6 (exposición media, pero son el núcleo del negocio) | #154, #170 | Si el flujo central (publicar, asignar, viajar, cerrar, calificar) no respeta las reglas, el resto de las características no importa. Es la característica con más requisitos trazados (9 de 15). |

**Por qué no entra la eficiencia:** el endpoint más cargado respondió con un p95 23 veces menor que el umbral y 0 % de error, sin defectos. Hoy no es el cuello de botella; tiene sentido revisarla cuando haya más usuarios reales.

---

## 6. Métricas interpretadas

### 6.1 Tabla de métricas

| Métrica | Valor | Fuente | Interpretación |
|---|---|---|---|
| Cobertura de sentencias, backend `trips` | **93,9 %** (93/99) | Jest, [run 39639648905](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39639648905) | Supera el 80 % del Nivel 3. Las 6 líneas sin cubrir son `trips.module.ts`, la declaración del módulo, que no tiene lógica. |
| Cobertura de decisiones, backend `trips` | **100 %** (24/24) | Jest, mismo run | Cada `if` se probó por las dos ramas. No impidió #170, porque el defecto es justamente que falta una decisión. |
| Cobertura de decisiones, pantalla de detalle del viaje | **76,2 %** (48/63) | Jest, mismo run | Por debajo del 80 %: es el punto más débil de la cobertura del módulo. |
| Cobertura SonarCloud (líneas + condiciones, backend + frontend del módulo) | 84,5 % → **87,0 %** | SonarCloud, `develop` | Criterio distinto al de Jest, por eso los números no coinciden. Subió con las correcciones del 20/10. |
| Duplicación | **0 %** | SonarCloud | Muy por debajo del límite del 5 % del quality gate. |
| Calificaciones de fiabilidad, seguridad y mantenibilidad | **A / A / A** | SonarCloud | El código propio no tiene bugs, vulnerabilidades ni deuda relevante según el análisis estático. |
| Riesgos en dependencias | **238 (C)** | SonarCloud | Peor dato del análisis. Son vulnerabilidades conocidas en librerías de terceros. Pendiente. |
| Tests del CI | 632 backend + 418 frontend, todos en verde | [run 39639648905](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39639648905) | El 23/10 la suite completa pasaba. |
| Latencia p95 del tracking (stress, 50 VUs) | **19,3 ms** | k6, [run 39488546108](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39488546108) | 23 veces por debajo del umbral de 500 ms. |
| Latencia p95 del tracking (soak, 20 VUs, 10 min) | **16,9 ms**, 0 % error | k6, [run 39602779633](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39602779633) | La latencia no crece con el tiempo: no hay señales de fugas de memoria ni de conexiones. |
| E2E post-deploy | **8/8 pasos en 5,3 s** | Deploy to VPS, [run 39639648761](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39639648761) | El ciclo completo funciona en dev contra OSRM real. |
| **Densidad de defectos** (métrica de proyecto) | **6,8 defectos/KLOC** | [`trazabilidad.md`](trazabilidad.md) §2 | Ver §6.3. |
| **Tiempo medio de corrección de defectos** (métrica de proceso) | **8,9 h** | GitHub Issues | Ver §6.2. |
| Tasa de éxito del CI (19/10 al 25/10) | **70 %** (21 de 30 runs terminados) | GitHub Actions, workflow CI | Ver §6.2. |
| Tasa de éxito de los deploys (19/10 al 25/10) | **91 %** (10 de 11 runs terminados) | GitHub Actions, workflow Deploy to VPS | El deploy fallido fue el E2E en rojo que detectó #168. |

### 6.2 Métrica de proceso: tiempo de corrección de defectos

Mide **cuánto tarda el equipo desde que registra un defecto hasta que lo cierra con la corrección verificada**. Es de proceso porque describe cómo trabaja el equipo, no cómo es el producto.

| Issue | Severidad | Registrado | Cerrado | Tiempo |
|---|---|---|---|---|
| [#154](https://github.com/CargoLink-proyecto-final/CargoLink/issues/154) | Media | 20/10 19:43 | 21/10 12:42 | 16 h 59 min |
| [#155](https://github.com/CargoLink-proyecto-final/CargoLink/issues/155) | Alta | 20/10 19:43 | 21/10 12:42 | 16 h 59 min |
| [#160](https://github.com/CargoLink-proyecto-final/CargoLink/issues/160) | Media | 21/10 12:51 | 21/10 13:51 | 1 h 00 min |
| [#161](https://github.com/CargoLink-proyecto-final/CargoLink/issues/161) | Alta | 21/10 12:51 | 21/10 13:30 | 0 h 38 min |
| **Media** | | | | **8 h 54 min** |

Horas en UTC, tomadas de los issues.

- **Quedan afuera** #168, que se registró después de corregido (el issue se abrió y cerró en el mismo minuto, así que su tiempo no es real), y #170, que sigue abierto desde el 23/10.
- **Lectura:** la meta era menos de 24 h y se cumple. Pero la media esconde dos grupos: los defectos del 20/10 tardaron 17 h porque se registraron a la noche y se corrigieron al día siguiente, y los del 21/10 tardaron menos de 1 h. Lo que más influye en el tiempo es cuándo se registra el defecto, no lo difícil que es.
- **Lectura crítica:** que #168 se haya registrado después del fix es una falla del proceso: el defecto se corrigió primero y se documentó después. La plantilla del Anexo B del plan pide registrar antes de corregir.

**Métrica de proceso complementaria, tasa de éxito del CI (70 %):** de los 9 runs en rojo, los que están documentados corresponden a defectos reales (#154) o a tests escritos a propósito para fallar antes del fix (rojo de #161). Una tasa del 100 % no sería mejor: significaría que el CI nunca detecta nada.

### 6.3 Métrica de proyecto: densidad de defectos

Mide **cuántos defectos hay por cada mil líneas de código de producción**. Es de proyecto porque describe el producto.

- Código de producción del alcance (`trips`, `ratings` y `routing.ts`): **442 líneas** sin comentarios ni líneas en blanco.
- Defectos en ese código: **3** (#155, #161 y #170). No cuentan #154, que era un error del test, ni #160 y #168, que eran de configuración del build y del runtime.
- **Densidad = 3 / 0,442 KLOC = 6,8 defectos/KLOC.**

**Interpretación:** con un código tan chico, un solo defecto mueve mucho el número (cada defecto suma 2,3/KLOC), así que sirve más para seguir la tendencia que para compararse con otros proyectos. El dato útil es *dónde* están los defectos: los tres están en la entrada o la salida del módulo (validación, control de acceso, llamada externa), no en la lógica de negocio. Ahí conviene poner las próximas pruebas.

### 6.4 Mejora medida antes y después

| Mejora | Antes | Después | Evidencia |
|---|---|---|---|
| Test "Calificar Viaje" actualizado a la regla vigente (#154) | CI en rojo: `1 failed, 414 passed, 415 total` | CI en verde: `416 passed, 416 total` | [run 39355651783](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39355651783) → [run 39491475554](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39491475554); capturas en [`capturas/`](capturas/) |
| Cobertura del módulo en SonarCloud | 84,5 % | 87,0 % | Capturas `sonarcloud-develop-gate.jpg` y `sonarcloud-develop-gate-despues.jpg` |
| Cierre del viaje con OSRM que no responde (#155) | Se colgaba sin límite | Responde en ≤ 5 s y cierra el viaje | `trips-osrm.integration.spec.ts`; [run 39486757526](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39486757526) |
| Distancia calculada desde el VPS (#168) | E2E 6/8, paso 7 en rojo (`distanceKm` null) | E2E 8/8, 36,5 km calculados por OSRM | [run 39617516989](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39617516989/attempts/2) → [run 39639648761](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39639648761) |

---

## 7. Prácticas de QA y de QC

- **QA (aseguramiento):** actúa sobre el **proceso**, para **prevenir** defectos. Responde "¿estamos trabajando de forma que salga bien?".
- **QC (control):** actúa sobre el **producto**, para **detectar** defectos. Responde "¿lo que hicimos está bien?".

| Práctica en CargoLink | QA o QC | Por qué |
|---|---|---|
| Plan de pruebas versionado con criterios de entrada y salida | QA | Define cómo se va a probar antes de probar |
| Análisis de riesgos (probabilidad × impacto) | QA | Decide dónde poner el esfuerzo de prueba |
| Gitflow + PR obligatorio contra `develop` | QA | Evita que entre código sin pasar por el CI |
| Conventional commits validados por hook | QA | Mantiene el historial trazable (commit ↔ issue ↔ PR) |
| Plantillas de caso de prueba y de defecto | QA | Estandarizan cómo se documenta |
| Configuración del quality gate (cobertura, duplicación, calificaciones) | QA | Fija el umbral de calidad aceptable de antemano |
| Selección de herramientas con matriz de decisión (§9) | QA | Decide con qué se controla |
| Ejecución de tests unitarios y de integración (Jest) | QC | Verifica el código |
| Análisis estático de SonarCloud en cada push | QC | Inspecciona el código y encuentra problemas |
| Pruebas de carga k6 | QC | Mide el desempeño del producto |
| Smoke y E2E después de cada deploy | QC | Verifica el producto desplegado |
| Diseño y ejecución de casos de caja negra | QC | Encontró #170 |
| Revisión de código | QC | Encontró #161 |

La regla "todo defecto corregido tiene su prueba de regresión" combina las dos: es una **regla de proceso (QA)** que produce una **prueba que controla el producto (QC)** en cada CI.

---

## 8. Mapa de herramientas

| Categoría | Herramienta | Uso en el proyecto | Nivel o etapa |
|---|---|---|---|
| Control de versiones | Git + GitHub | Repositorio, gitflow, PRs | Todo el ciclo |
| Gestión de defectos | GitHub Issues (etiqueta `bug`) | Registro de defectos con plantilla y trazabilidad a PRs y runs | Gestión |
| CI | GitHub Actions (`ci.yml`) | Lint, build, tests con cobertura, SonarCloud y k6 en cada push y PR | Integración continua |
| CD | GitHub Actions (`deploy-vps.yml`) + runner self-hosted + `deploy.sh` | Deploy a dev y prod con backup, healthcheck, smoke y E2E | Despliegue continuo |
| Pruebas unitarias e integración, backend | Jest + `@nestjs/testing` | 632 tests; integración con la app Nest levantada en un puerto | Unitario, integración |
| Pruebas unitarias, frontend | Jest + Testing Library (`react`, `user-event`, `jest-dom`) | 418 tests de componentes y pantallas | Unitario |
| Análisis estático | ESLint | Estilo y errores comunes, en el CI | Estático |
| Análisis estático | TypeScript (`strict` en el frontend) | Errores de tipos en compilación | Estático |
| Análisis estático y quality gate | **SonarCloud** | Bugs, vulnerabilidades, duplicación, cobertura y gate | Estático |
| Pruebas de carga | **k6** (`grafana/k6:0.54.0`) | Stress en cada CI, soak a mano | Carga |
| Smoke | Bash + curl (`smoke.sh`) | 7 checks después de cada deploy | Sistema |
| E2E | Node 20, script sin dependencias (`e2e-trips.mjs`) | 8 pasos contra dev y OSRM real | Sistema / aceptación |
| Documentación de API | Swagger (`@nestjs/swagger`) | Contrato de la API en `/api/docs` | Documentación |
| Infraestructura | Docker Compose, PostgreSQL 15, Cloudflare Tunnel | Entornos reproducibles (local, CI, dev y prod) | Entorno |
| Asistencia de IA | Claude Code, con subagente de QA | Revisión previa a cada PR y generación de pruebas y documentación, revisadas por el equipo | Proceso |

**Incorporadas para el TP:** SonarCloud y k6. Las dos se integraron al pipeline. k6 se documenta con el proceso completo de cinco pasos en la sección siguiente.

---

## 9. Herramienta nueva: k6, con el proceso de cinco pasos

### Paso 1: Requisitos

Qué tenía que cumplir la herramienta de pruebas de carga **antes** de mirar opciones:

| ID | Requisito | Tipo |
|---|---|---|
| HQ-1 | Los scripts se escriben en un lenguaje que el equipo ya usa. El repo es 100 % TypeScript/JavaScript y no tiene Python | Obligatorio |
| HQ-2 | Los umbrales (error, p95, p99) se declaran en el script y **hacen fallar el job** si se cruzan (código de salida ≠ 0) | Obligatorio |
| HQ-3 | Corre en GitHub Actions sin instalar nada a mano (imagen Docker o binario) | Obligatorio |
| HQ-4 | El script es código legible y revisable en un PR, no un archivo generado por una GUI | Obligatorio |
| HQ-5 | Libre y gratuita | Obligatorio |
| HQ-6 | Un mismo script sirve para stress y para esfuerzo sostenido, cambiando solo el perfil | Deseable |
| HQ-7 | Bajo consumo de recursos: el runner de GitHub tiene 2 núcleos y comparte la máquina con el backend y Postgres | Deseable |
| HQ-8 | Exporta un resumen en JSON para publicarlo en el *job summary* | Deseable |

### Paso 2: Mercado

| Herramienta | Lenguaje de los scripts | Umbrales que cortan el CI | Observaciones |
|---|---|---|---|
| **k6** (Grafana Labs) | JavaScript | Nativos (`thresholds`) | Binario en Go, imagen Docker oficial, escenarios con rampas en el mismo script |
| **Artillery** | YAML + JavaScript | Con `ensure` | Corre sobre Node; un solo hilo limita la carga que genera |
| **Gatling** | Scala, Java o Kotlin (SDK de JavaScript reciente) | Con `assertions` | Muy buenos reportes HTML; JVM pesada para un runner chico |
| **Locust** | Python | No nativos: hay que programar el código de salida | Requiere Python, que no existe en el repo |
| **Apache JMeter** | XML (`.jmx`) armado desde una GUI | Requiere plugins o parsear resultados | Muy completo, pero los `.jmx` son difíciles de revisar en un PR |

### Paso 3: Prueba de concepto

**Objetivo:** confirmar que k6 genera carga contra nuestro backend, evalúa los umbrales y produce un resumen legible, antes de decidir y de meterlo en el pipeline. Se hizo con k6, la candidata que mejor cumplía los requisitos obligatorios en el análisis de mercado.

**Criterios de éxito, fijados antes:** (a) el script corre contra el stack local con un comando, (b) los cuatro umbrales se evalúan y cambian el código de salida, (c) el resumen JSON se puede convertir en una tabla.

| Prueba | Resultado |
|---|---|
| Perfil `quick` (5 VUs, 20 s) contra el stack local de docker compose | El script funciona; los checks verifican status 200 y la posición guardada |
| Línea base `stress` local (50 VUs, 2026-10-20) | 5.956 requests, p95 21,9 ms, 0 % de error, 100 % de checks. Los cuatro umbrales se evalúan |
| Resumen JSON → `.github/scripts/k6-summary.js` | Tabla en Markdown lista para el *job summary* |

Los tres criterios se cumplieron. Problema encontrado en la PoC: armar un viaje `IN_PROGRESS` por API exigía un transportista con perfil aprobado. Se resolvió con un fixture que crea el viaje directo en la base (`backend/prisma/k6-fixture.ts`).

### Paso 4: Matriz de decisión

Puntaje de 1 (no cumple) a 5 (cumple de sobra), ponderado por la importancia de cada criterio. Los pesos salen de los requisitos: los obligatorios pesan más.

| Criterio (requisito) | Peso | k6 | Artillery | Gatling | Locust | JMeter |
|---|---|---|---|---|---|---|
| Lenguaje del equipo (HQ-1) | 25 % | 5 | 5 | 3 | 1 | 1 |
| Umbrales que cortan el CI (HQ-2) | 20 % | 5 | 4 | 4 | 2 | 2 |
| Corre en CI sin instalación (HQ-3) | 15 % | 5 | 4 | 4 | 4 | 3 |
| Script legible y revisable (HQ-4) | 15 % | 5 | 4 | 4 | 5 | 1 |
| Consumo de recursos (HQ-7) | 10 % | 5 | 3 | 4 | 2 | 2 |
| Reporte exportable (HQ-8) | 10 % | 4 | 4 | 5 | 3 | 4 |
| Curva de aprendizaje y documentación | 5 % | 4 | 4 | 3 | 4 | 3 |
| **Puntaje ponderado (sobre 5)** | **100 %** | **4,85** | **4,15** | **3,80** | **2,70** | **2,00** |

Todas son libres y gratuitas (HQ-5), así que ese requisito no desempata. HQ-6 lo cumplen todas.

**Decisión: k6.** Es la única que cumple los cuatro requisitos obligatorios con el puntaje máximo. Lo que la define frente a Artillery, la segunda, es que los umbrales son nativos y el binario en Go genera más carga con menos CPU, lo que importa en un runner que comparte la máquina con el backend y Postgres. Locust y JMeter quedan descartadas por HQ-1 y HQ-4.

### Paso 5: Despliegue incremental

| Etapa | Fecha | Qué se hizo | Evidencia | Resultado |
|---|---|---|---|---|
| 1. Local | 20/10 | `tests/k6/run-local.sh`, un comando contra docker compose | Línea base de [`pruebas-carga.md`](pruebas-carga.md) | ✅ |
| 2. CI, sin bloquear | 20/10 | Job `Stress · k6` en cada push y PR, con Postgres efímero. **No** es check requerido, porque los tiempos de un runner compartido varían | PR #158; [run 39488546108](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39488546108): p95 19,3 ms | ✅ |
| 3. Esfuerzo sostenido a demanda | 21/10 | Perfil `soak` lanzado desde *Run workflow* | [run 39602779633](https://github.com/CargoLink-proyecto-final/CargoLink/actions/runs/39602779633): 10 min, p95 16,9 ms | ✅ después de un ajuste: el primer intento lo canceló un push a `develop` porque compartían el grupo de concurrencia. Se corrigió en #162 |
| 4. Capacidad máxima | Pendiente | Subir `MAX_VUS` hasta que el p95 cruce 500 ms, para documentar el punto de quiebre | — | ⏳ |

**Lección del despliegue incremental:** la etapa 3 encontró un problema (la cancelación por concurrencia) que no se habría visto si k6 hubiera entrado de una vez como check obligatorio. Con un despliegue gradual, el problema solo canceló una corrida manual y no bloqueó el trabajo de nadie.

---

## 10. Metas del Nivel 3: cumplidas y no cumplidas

| Aspecto | Meta (Nivel 3) | Estado | Comentario |
|---|---|---|---|
| Pipeline | Compilación, pruebas, análisis estático, cobertura, quality gate y reporte automático | ✅ | `ci.yml` con los tres jobs y *job summary* |
| Quality gate | Bloquea ante bugs críticos, duplicación > 5 % y cobertura sobre código nuevo < 80 % | ⚠️ | El gate *Sonar way* es más estricto que la consigna y hace fallar el job, pero sin GitHub Pro no se puede impedir el merge (R3, riesgo aceptado) |
| Cobertura sobre código nuevo | 80 % | ⚠️ | El criterio S4 del plan lo deja para el informe: hay que tomar el dato de *New Code* de SonarCloud |
| Cobertura sobre código existente | 80 % | ⚠️ | Se cumple en el módulo `trips` (93,9 % sentencias, 100 % decisiones), que es el alcance declarado. **No está medido sobre todo el proyecto**, y la pantalla de detalle tiene 76,2 % de decisiones |
| Plan de pruebas y riesgos | Versionado, con criterios de entrada y salida, riesgos P × I y trazabilidad | ✅ | `plan-de-pruebas.md`, `riesgos.md`, `trazabilidad.md` |
| Defectos | Con pasos, esperado y obtenido, vinculados a su caso | ✅ | 6 issues con la plantilla; #168 registrado después del fix |
| Herramienta nueva | Proceso de cinco pasos | ✅ | k6, §9 de este documento |
| Smoke test | Ejecutado por el pipeline después del deploy | ✅ | `deploy.sh` paso 6, en dev y prod |
| Integración externa | Flujo E2E automatizado en cada despliegue | ✅ | E2E 8/8 contra OSRM real en cada deploy a dev |
| Stress y esfuerzo sostenido | Stress ejecutado, con resultados y umbrales | ✅ | Stress en cada CI y soak con resultados. Falta el punto de quiebre |
