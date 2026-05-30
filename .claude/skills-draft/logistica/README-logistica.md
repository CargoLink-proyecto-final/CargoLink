# Skill `logistica` — Guía para el equipo de producto/operaciones

Este es el **skill de dominio** que Claude va a consultar cuando una tarea involucre las reglas de negocio de CargoLink: los roles, el ciclo de vida de una carga, las postulaciones y negociación de precio, los viajes con tracking GPS, las calificaciones y el vocabulario del transporte de carga por carretera.

Lo mantiene **el equipo de producto/operaciones** junto al equipo técnico, porque las reglas del dominio (qué transiciones de estado son válidas, qué puede hacer cada rol, qué términos usa la gente del rubro) son las que dan contexto a las decisiones de implementación.

## Estado actual — **Borrador**

Este skill está en fase de redacción. Mientras viva en `.claude/skills-draft/`, **Claude no lo ve** (no está indexado). Es intencional: no queremos que el asistente use información a medio cargar como si fuera definitiva. Cuando el equipo revise y apruebe el contenido, el equipo técnico lo promueve moviéndolo a `.claude/skills/logistica/` (con su frontmatter YAML) y desde ahí Claude empieza a usarlo.

## Base de la verdad

Todo lo de este skill está **derivado del código real**, no inventado:
- Roles y estados (enums): [`backend/prisma/schema.prisma`](../../../backend/prisma/schema.prisma).
- Flujos y endpoints: [`docs/backend.md`](../../../docs/backend.md), [`docs/api.md`](../../../docs/api.md), [`docs/base-de-datos.md`](../../../docs/base-de-datos.md).

Si una regla del dominio cambia en el código (ej. se agrega un estado al enum `LoadStatus`), **hay que actualizar este skill para que no quede desfasado**. Cuando edites, contrastá contra `schema.prisma`.

## Estructura

```
.claude/skills-draft/logistica/
├── README-logistica.md           ← este archivo
├── content/
│   ├── roles.md                  ← los 3 roles y qué puede hacer cada uno
│   ├── ciclo-de-carga.md         ← lifecycle de Load + enums de estado reales
│   ├── postulaciones.md          ← flujo de bidding + negociación de precio
│   ├── viajes-tracking.md        ← Trip, estados, GPS, chat por trip
│   ├── calificaciones.md         ← ratings post-trip
│   └── glosario.md               ← términos del rubro (ES/EN)
└── examples/
    └── casos-de-uso.md           ← recorridos típicos end-to-end
```

## Cómo editar

1. Abrí el archivo que quieras editar.
2. Donde veas el marcador **`<<COMPLETAR: ...>>`**, reemplazalo por el dato real (cuando lo confirmes con el código o con operaciones).
3. **No inventes estados ni campos.** Si no estás seguro, dejá el marcador — es mejor que Claude vea "falta confirmar" a que use algo inventado.
4. Abrí un PR pidiendo review al equipo técnico.

## Qué NO hacer

- **No editar el `SKILL.md`** (cuando exista tras la promoción) — tiene frontmatter YAML que si se rompe inhabilita el skill.
- **No inventar estados, transiciones ni campos** que no estén en `schema.prisma`.
- **No cambiar los nombres de archivo** ni la estructura de carpetas.
- **No meter código** (queries, endpoints) en `content/` — eso vive en las skills técnicas (`backend-endpoint`, `db-migration`). Acá va el **dominio**: reglas, flujos, vocabulario.
