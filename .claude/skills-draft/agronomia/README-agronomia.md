# Skill `agronomia` — Guía para el equipo agronómico

Este es el **skill de dominio** que Claude va a consultar cuando el producto involucre datos agronómicos (rinde, cultivos, índices satelitales, campañas, etc.).

Lo mantienen **ustedes**, el equipo agronómico, porque los datos de dominio cambian y es el equipo el que sabe si el rango esperable de rinde de trigo en la zona núcleo cambió de un año al otro.

## Estado actual — **Borrador**

Este skill está en fase de redacción. Mientras viva en `.claude/skills-draft/`, **Claude no lo ve**. Es intencional: no queremos que el asistente use información a medio cargar como si fuera definitiva. Cuando ustedes revisen y aprueben el contenido, el equipo técnico lo promueve moviendolo a `.claude/skills/agronomia/` y desde ahí Claude empieza a usarlo.

## Qué archivos pueden tocar

Todo lo que está bajo **`content/`** y **`examples/`** es suyo. Los nombres de archivo son fijos (no cambien los nombres), pero el contenido interno lo pueden editar libremente.

```
.claude/skills-draft/agronomia/
├── README-agronomia.md           ← este archivo (lo mantiene técnico)
├── content/
│   ├── cultivos.md               ← editable — rangos, ciclos, variables
│   ├── unidades.md               ← editable — qq/ha, kg/ha, mm, etc.
│   ├── indices-satelitales.md    ← editable — NDVI, Stress Top, otros
│   ├── campanas.md               ← editable — convención de nombrado, fechas
│   └── glosario.md               ← editable — términos del dominio
└── examples/
    └── casos-de-uso.md           ← editable — casos típicos
```

## Cómo editar — pasos rápidos

1. Abran el archivo que quieran editar directamente en GitHub (botón "Edit" con el ícono del lápiz).
2. Busquen los marcadores **`<<COMPLETAR: ...>>`**. Cada uno les dice qué dato va ahí.
3. Reemplacen el marcador por el valor real.
4. Abajo del todo, GitHub les pregunta dónde commitear. Elijan "create new branch" con un nombre corto descriptivo (ej: `docs/agronomia-cultivos-trigo`).
5. Abran un Pull Request pidiendo review al equipo técnico.

## Cómo agregar un cultivo nuevo

Abran `content/cultivos.md`. Van a ver que cada cultivo tiene la misma estructura:

```markdown
## Trigo

**Ciclo fenológico:** <<COMPLETAR: fases>>
**Variables de decisión clave:** <<COMPLETAR>>
**Rango esperable de rinde por zona:**
- Núcleo: <<COMPLETAR: min-max qq/ha>>
- Norte: <<COMPLETAR: min-max qq/ha>>
**Índices satelitales relevantes:** <<COMPLETAR>>
```

Para un cultivo nuevo (ej: cebada), copian el bloque entero de trigo, cambian el título a `## Cebada`, y llenan los campos. El formato **tiene que mantenerse igual** en todos los cultivos para que Claude pueda consultarlos.

## Cómo agregar un índice satelital

Misma idea en `content/indices-satelitales.md`. Cada índice tiene:
- Qué mide.
- Rango esperable de valores.
- Interpretación agronómica.
- Fuente de los datos.

Copien la estructura de los existentes, no inventen formato nuevo.

## Cómo actualizar unidades

`content/unidades.md` tiene una tabla con unidades estándar de Rinde. Si decidimos que un cierto reporte tiene que mostrarse en `tn/ha` en vez de `qq/ha`, se cambia ahí — pero primero coordinen con el equipo técnico, porque el cambio de unidad puede impactar endpoints y dashboards.

## Cómo escribir una entrada de glosario

`content/glosario.md` es para términos que el resto del equipo (técnico) puede necesitar traducir. Entradas cortas, 1-2 líneas:

```markdown
### Rinde

Cantidad cosechada por unidad de superficie. Se expresa en qq/ha en Rinde por convención (ver `unidades.md`).
```

## Qué NO hacer

- **No editen `SKILL.md`** (cuando exista). Ese archivo lo mantiene el equipo técnico — tiene frontmatter YAML y configuración que si se rompe, Claude no puede usar el skill.
- **No inventen datos** para cerrar un `<<COMPLETAR>>`. Si no tienen el valor, dejen el marcador — es mejor que Claude vea "falta este dato" a que use un valor inventado.
- **No cambien los nombres de archivos** ni la estructura de carpetas — el `SKILL.md` los referencia por nombre.
- **No metan contenido técnico** (SQL queries, código, endpoints) en estos archivos. Son de dominio agronómico.

## Dudas

Abran un issue en el repo mencionando al equipo técnico, o preguntar en el canal de desarrollo.
