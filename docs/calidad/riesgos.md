# Riesgos del módulo de viajes

Parte del [plan de pruebas](plan-de-pruebas.md) (v1.0, 2026-10-23). Lista los riesgos de producto y de proceso del módulo `trips`, los prioriza por **probabilidad × impacto** y dice qué prueba mitiga cada uno. La prioridad decide qué se prueba primero y con qué profundidad.

## Escala

| Valor | Probabilidad | Impacto |
|---|---|---|
| 1, Baja | Requiere una combinación rara de condiciones | Molestia menor; hay un camino alternativo |
| 2, Media | Puede pasar en el uso normal o en un entorno distinto | Se pierde un dato o una función secundaria; el ciclo del viaje sigue |
| 3, Alta | Ya pasó, o pasa sin hacer nada raro | Se corta el ciclo del viaje, se exponen datos personales o se pierde plata |

**Exposición = P × I** (de 1 a 9). Prioridad: **alta** de 6 a 9, **media** de 3 a 4, **baja** de 1 a 2.

## Matriz

|  | **Impacto 1** | **Impacto 2** | **Impacto 3** |
|---|---|---|---|
| **Probabilidad 3** | | R1, R2, R3 | |
| **Probabilidad 2** | R10 | R5, R6, R7, R8 | R4, R9 |
| **Probabilidad 1** | | R11 | |

## Riesgos priorizados

| ID | Riesgo | P | I | Exp. | Prioridad | Mitigación / prueba | ¿Se materializó? |
|---|---|---|---|---|---|---|---|
| R1 | **OSRM caído, lento o con rate limit.** Es un servidor público sin SLA, y el cierre del viaje lo llama siempre. | 3 | 2 | 6 | Alta | Timeout de 5 s y contingencia (distancia `null`, el viaje se cierra igual). Integración con OSRM falso que responde bien, con error o nunca. E2E con OSRM real en cada deploy. | Sí: [#155](https://github.com/CargoLink-proyecto-final/CargoLink/issues/155), el cierre se colgaba sin timeout. |
| R2 | **El entorno desplegado se comporta distinto del CI** (red, DNS, IPv6, latencia). Lo que pasa en el runner de GitHub puede fallar en el VPS. | 3 | 2 | 6 | Alta | Smoke y E2E después de cada deploy, contra el entorno real. | Sí: [#168](https://github.com/CargoLink-proyecto-final/CargoLink/issues/168), Node cortaba el connect a OSRM a los 250 ms solo en el VPS. |
| R3 | **El quality gate no bloquea el merge.** Sin GitHub Pro no hay *branch protection*: un PR con checks en rojo se puede mergear igual. | 3 | 2 | 6 | Alta | Regla de equipo de no mergear en rojo; checks visibles en cada PR. Riesgo **aceptado** y documentado. | No hubo merges en rojo, pero la protección depende de las personas. |
| R4 | **Acceso a datos de un viaje ajeno.** El detalle trae teléfonos de las dos partes y la ubicación del camión. | 2 | 3 | 6 | Alta | Chequeo de ownership en `findByIdForUser`. Integración por HTTP: 200 a las partes y al admin, 403 a otro transportista y a otro dador. | Sí: [#161](https://github.com/CargoLink-proyecto-final/CargoLink/issues/161), IDOR en `GET /trips/:id`. |
| R5 | **Datos de ubicación inválidos.** Coordenadas fuera de rango, tipos incorrectos o posiciones reportadas con el viaje ya cerrado. | 2 | 2 | 4 | Media | Casos con clases de equivalencia y valores límite (CP-LOC-01 a 12). | **Sí, abierto:** [#170](https://github.com/CargoLink-proyecto-final/CargoLink/issues/170). |
| R6 | **Transición de estado inválida.** Cerrar un viaje sin iniciarlo, iniciarlo dos veces u operar sobre el viaje de otro. | 2 | 2 | 4 | Media | Tabla de decisión (CP-EST). Unitarias de `startTrip` y `completeTrip` para cada combinación. | No. |
| R7 | **El tracking se degrada con muchos camiones a la vez.** Es el endpoint de más tráfico: un reporte cada 5 s por viaje activo. | 2 | 2 | 4 | Media | k6 `stress` (50 VUs) en cada CI y `soak` (20 VUs, 10 min), con umbrales fijados antes de ejecutar. | No: p95 de 19,3 ms en stress y 16,9 ms en soak, con 0 % de error. |
| R8 | **Build no reproducible.** El build depende de recursos de red (fuentes, paquetes) y falla de forma intermitente. | 2 | 2 | 4 | Media | Fuentes servidas desde el repo. El build corre en cada CI y en cada deploy. | Sí: [#160](https://github.com/CargoLink-proyecto-final/CargoLink/issues/160), `next/font/google`. |
| R9 | **Caída del host.** Un único VPS para dev y prod, sin control del router. | 2 | 3 | 6 | Alta | Backups diarios con `pg_dump` (14 copias de prod), reinicio automático de contenedores y túnel, healthcheck en cada deploy. Plan de mudanza a otro proveedor en preparación. | Sí: cortes de red el 30/09, el 19/10 y el 20/10. |
| R10 | **Tests desactualizados respecto del código.** Un test que falla por una regla vieja da una falsa alarma y le quita confianza al CI. | 2 | 1 | 2 | Baja | Revisar el test junto con la regla en el mismo PR. | Sí: [#154](https://github.com/CargoLink-proyecto-final/CargoLink/issues/154), el test "Calificar Viaje" esperaba la regla anterior. |
| R11 | **Calificación indebida.** Que califique el transportista, que se califique dos veces o que se califique un viaje sin cerrar. | 1 | 2 | 2 | Baja | Tabla de decisión (CP-CAL). Unitarias de `RatingsService.create` y unique constraint `(tripId, fromUserId)` en la base. | No. |

## Lectura

- **Siete de los once riesgos se materializaron durante el TP.** Eso no habla mal del análisis: los encontraron justamente las actividades que se planificaron para cada riesgo. El pipeline detectó R2 (E2E) y R8 (CI); la revisión de código y de la contingencia, R1 y R4, cuyas correcciones verifican las pruebas de integración; el diseño de casos de caja negra, R5. R9 y R10 aparecieron en la operación y en la primera corrida del CI.
- **R2 es el más interesante para el informe.** Ninguna prueba del CI lo podía encontrar, porque en los runners de GitHub el connect a OSRM es más rápido que el límite de Node. Solo lo vio el E2E post-deploy, y por eso ese nivel está en la estrategia.
- **R3 se acepta en lugar de mitigarse,** porque la solución técnica (GitHub Pro) cuesta plata y está fuera del alcance de un TFG. El informe lo marca como meta no cumplida del todo.
- **R5 sigue abierto.** Es el único defecto abierto del módulo, de severidad media.
