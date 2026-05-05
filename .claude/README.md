# `.claude/` — Tooling de Claude Code para RindePlus/Plataforma

Esta carpeta contiene la configuración, skills, subagentes y hooks que Claude Code usa al trabajar sobre este repo. Está versionada para que **todo el equipo** tenga el mismo comportamiento del agente sin tener que configurar nada localmente.

Si arrancás a usar Claude Code en este repo, empezá leyendo [`../CLAUDE.md`](../CLAUDE.md) — ahí están las reglas de branching, commits, arquitectura de IA y flujo de PR. Este archivo es complemento operativo.

## Mapa de la carpeta

```
.claude/
├── README.md                     Este archivo.
├── settings.json                 Hooks registrados (UserPromptSubmit, PreToolUse, SessionStart, Stop).
├── hooks/                        Scripts ejecutables de hooks.
│   ├── branch-context.sh         Inyecta contexto git en cada prompt.
│   ├── pre-commit-validate.sh    Valida rama protegida + formato de mensaje en git commit.
│   ├── session-start.sh          Alerta si hay otras sesiones Claude abiertas (detecta via lockfile).
│   └── stop.sh                   Recuerda cambios sin commitear al terminar turno.
├── commands/                     Slash-commands invocables con /.
│   ├── branch-new.md             Crea feature branch desde develop, pregunta si usar worktree.
│   ├── branch-switch.md          Switcha a feature branch existente.
│   ├── commit.md                 Arma commit conventional desde el diff.
│   ├── pr.md                     Invoca qa-engineer + push + gh pr create contra develop.
│   ├── pr-status.md              CI/reviews del PR de la rama actual.
│   ├── merge-pr.md               Mergea PR a develop con confirmación del user + cleanup.
│   ├── release.md                Abre PR develop→main (nunca mergea ni aprueba).
│   ├── prune-branches.md         Borra locales ya mergeadas.
│   ├── sync.md                   Fast-forward con origin/develop.
│   ├── worktree-new.md           Crea worktree aislado con feature branch.
│   ├── upstream-pending.md       Lista commits upstream pendientes de portear.
│   └── upstream-port.md          Portea un commit upstream adaptado a este repo.
├── skills/                       Skills técnicas cargadas on-demand por Claude.
│   ├── ui-design/                Diseño UI/UX + implementación frontend (Next.js 15 + React 19 + Tailwind + Vitest). SKILL.md + references/ por tema.
│   ├── backend-endpoint/         FastAPI + SQLAlchemy + JWT + Pydantic.
│   ├── db-migration/             Alembic en backend/alembic/versions/.
│   └── self-review-checklist/    8 items de auto-revisión antes de cerrar tarea.
├── skills-draft/                 Skills en borrador — NO indexadas por Claude Code.
│   └── agronomia/                Skill de dominio; contenido editable por el equipo agronómico.
├── agents/                       Subagentes con rol específico.
│   ├── qa-engineer.md            QA de feature → develop (tests, lint, convenciones, migraciones).
│   └── release-engineer.md       Análisis agregado de release develop → main (migraciones con riesgo, breaking changes, release notes, checklist operacional).
├── scheduled_tasks.lock          (gitignored) estado local de Claude Code.
└── settings.local.json           (gitignored) overrides locales per-usuario.
```

## Qué edita quién

| Pieza | Owner | Editable sin review |
|---|---|---|
| `CLAUDE.md` | Equipo técnico | No (cambios via PR). |
| `settings.json` (hooks) | Equipo técnico | No (ajustes de infra). |
| `hooks/*.sh` | Equipo técnico | No. |
| `commands/*.md` (slash) | Equipo técnico | Sí, cambios incrementales via PR. |
| `skills/ui-design` | Equipo frontend | Sí, refleja convenciones de diseño e implementación frontend. |
| `skills/backend-endpoint` | Equipo backend | Sí, refleja convenciones del backend. |
| `skills/db-migration` | Equipo backend + DBA | Coordinado. |
| `skills/self-review-checklist` | Equipo técnico | Sí, incremental. |
| `skills/ui-design` | Equipo técnico (mantenimiento estructural) | Sí, incremental — actualizaciones de criterio sobre UI/UX. Contenido en inglés por excepción consciente. |
| `skills-draft/agronomia/content/*.md` | **Equipo agronómico** | Sí — ese es el punto. Ver `README-agronomia.md` en la propia carpeta. |
| `skills-draft/agronomia/SKILL.md`, `README-agronomia.md` | Equipo técnico | No (el técnico mantiene framework; agronomía toca solo `content/`). |
| `agents/qa-engineer.md` | Equipo técnico | Cambios estructurales via ADR + PR. |
| `agents/release-engineer.md` | Equipo técnico | Cambios estructurales via ADR + PR. |

Reglas de ownership complementarias:
- **Nadie bypassea el hook `PreToolUse`** (no `--no-verify`) salvo permiso explícito documentado.
- **Nadie edita un ADR aceptado** — se crea uno nuevo que lo superseda (ver `docs/adr/README.md`).
- **Claude nunca mergea ni aprueba un PR contra `main`** — el hook `PreToolUse` bloquea `gh pr merge` y `gh pr review --approve` cuando el PR apunta a main. El slash-command `/release` abre el PR y entrega URL; el merge a main lo hace el mantenedor humano desde GitHub. Ver ADR-0005.

## Cómo sumar un slash-command nuevo

Proceso, no permiso libre:

1. Discutí el caso de uso antes de escribir — si ya tenemos un slash que cubre 80% del caso, quizás vale extenderlo en vez de duplicar.
2. Crealo en `.claude/commands/<nombre>.md` con frontmatter `description` y `argument-hint` (si aplica).
3. En el body: **instrucciones específicas para Claude**, no explicación para el humano. Pasos numerados, comandos concretos, reglas de qué hacer ante errores.
4. Agregalo a la lista de `CLAUDE.md` § Slash-commands disponibles.
5. PR a `develop` con scope `chore(claude)` o `feat(claude)` según si agrega funcionalidad.

## Cómo sumar una skill nueva

Más ruido que un slash-command porque las skills pueden conflictuar entre sí en el dispatch semántico.

1. **ADR primero**. Si pensás que vale una skill propia, creá un ADR corto justificándolo — qué trigger la activa, por qué no entra en una existente, qué budget de description usa (ver `CLAUDE.md` § Arquitectura de IA sobre el límite de ~1536 chars combinados).
2. Creala en `.claude/skills/<nombre>/SKILL.md` con frontmatter completo (`name`, `description`, opcional `when_to_use` / `paths`).
3. La `description` es lo que dispara el skill — escribila con verbos + objetos + keywords del dominio. Ejemplos en las existentes.
4. Agregala a la tabla de `CLAUDE.md` § Skills disponibles.
5. Probá el dispatch: pedile a Claude 2-3 tareas que deberían activarla; si no se activa, refinar la description.

## Cómo modificar o agregar hooks

Los hooks son **reglas duras** (bloquean o inyectan contexto). Cambiar un hook afecta a toda la gente del equipo.

1. Cambios al hook requieren ADR si son comportamentales (ej. cambiar qué bloquea el `pre-commit-validate`).
2. Probar el hook manualmente antes de commitear (todos los scripts de `hooks/` se pueden correr standalone con `CLAUDE_PROJECT_DIR=/path/to/repo <hook.sh>`).
3. PR con scope `chore(claude)`.

## Cómo trabajo con worktrees

Ver `CLAUDE.md` § Worktrees. TL;DR: `/worktree-new <slug>` crea un directorio hermano con su propia rama; cada worktree trae su propio `.claude/` (viene por git), hooks y skills funcionan automáticamente. Advertencia: DB Docker y stack compose son compartidos entre worktrees — no correr migraciones en paralelo.

## Referencias

- Guía principal del workflow: [`../CLAUDE.md`](../CLAUDE.md).
- Decisiones arquitectónicas: [`../docs/adr/`](../docs/adr/).
- Skill borrador de agronomía (con su propia guía para el equipo): [`./skills-draft/agronomia/README-agronomia.md`](./skills-draft/agronomia/README-agronomia.md).
- Docs oficiales de Claude Code: https://code.claude.com/docs/
