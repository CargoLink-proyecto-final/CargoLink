# Casos de uso del skill `agronomia`

Estos ejemplos muestran al main agent cómo consultar este skill cuando una tarea del producto toca datos agronómicos. Sirven de referencia tanto para Claude como para el equipo técnico al diseñar features que dependan de estos datos.

---

## Caso 1 — Endpoint de detalle de lote devuelve rinde

Un desarrollador agrega un campo `rinde` al endpoint `GET /lotes/:id`. ¿En qué unidad lo devuelve?

**Consulta relevante:** `content/unidades.md`.

**Respuesta esperada:** el endpoint devuelve `rinde` en **qq/ha** porque Rinde usa esa unidad como estándar para rinde de cosecha en todos los reportes y dashboards. Si el cliente necesitara kg/ha (ej. export a sistemas externos), conversion es 1 qq/ha = 100 kg/ha — pero el default del API es qq/ha.

**Acción para el main agent:** al implementar el campo, documentar la unidad en el schema Pydantic de la respuesta (`rinde_qq_ha: float` deja la unidad explícita en el nombre, o usar un comment `# qq/ha`).

---

## Caso 2 — Dashboard muestra NDVI promedio de una campaña

Un desarrollador de frontend tiene que mostrar el NDVI promedio del lote para la campaña `2025/26`. Recibe un valor `0.72` del backend. ¿Cómo lo interpreta y lo presenta?

**Consultas relevantes:**
- `content/indices-satelitales.md` → NDVI.
- `content/campanas.md` → cómo se define la ventana temporal de la campaña 2025/26.

**Respuesta esperada:**
- 0.72 está en el rango de "vegetación vigorosa en pleno desarrollo" (ver interpretación en `indices-satelitales.md`).
- La campaña `2025/26` cubre un período específico (`<<COMPLETAR según campanas.md>>`), por lo que el valor representa el promedio de observaciones satelitales dentro de esa ventana para el lote.
- El frontend debería mostrar el valor con 2 decimales y, si es posible, colorear según rangos estándar (rojo <0.3, amarillo 0.3-0.6, verde >0.6) — confirmar con diseño.

---

## Caso 3 — Reporte agrupa lotes por zona

Un desarrollador implementa un reporte que agrupa lotes por zona (Núcleo, Norte, Sur de Buenos Aires, etc.) y muestra el rinde promedio. ¿Qué zonas considera y cómo se determinan?

**Consultas relevantes:**
- `content/campanas.md` → sección "Zonas que considera Rinde".
- `content/cultivos.md` → rangos esperables por zona (útiles para validar outliers).

**Respuesta esperada:**
- Las zonas que considera Rinde son las listadas en `campanas.md` → `<<COMPLETAR según ese archivo>>`.
- Si el rinde promedio de un lote cae fuera del rango esperable de su zona (según `cultivos.md`), marcarlo como outlier o pedir validación al usuario antes de incluirlo.

---

## Patrón general de consulta

Cuando una tarea del producto toca datos agronómicos, el main agent debería:

1. Identificar qué **aspecto** del dominio está involucrado: unidad, cultivo, índice, campaña, término.
2. Consultar el archivo correspondiente en `content/`.
3. Si el dato está como `<<COMPLETAR: ...>>` o falta, **no inventar** — avisar al usuario que el dato no está cargado y sugerir pedirlo al equipo agronómico.
4. Si el dato está cargado, usarlo literal — no paráfrasear rangos ni redondear unidades.
