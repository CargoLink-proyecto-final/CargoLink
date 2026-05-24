# Workflow de Claude Code

Este repo usa [Claude Code](https://code.claude.com/docs/) con configuración versionada bajo [`../.claude/`](../.claude/). Eso significa que cualquiera del equipo abre el repo en Claude Code y obtiene el mismo comportamiento: mismos hooks, mismas skills, mismos slash-commands, mismos subagentes.

Para las reglas operativas detalladas (qué hacer cuándo, branches, commits, formato de PR), la fuente de verdad es [`../CLAUDE.md`](../CLAUDE.md). Este documento es un mapa de **qué hay** y **cómo se agrega algo nuevo**.

## Mapa de `.claude/`

```
.claude/
├── README.md                Tooling guide para humanos.
├── settings.json            Hooks registrados.
├── settings.local.json      (gitignored) overrides locales por usuario.
├── hooks/                   Scripts ejecutables disparados por eventos del agente.
├── commands/                Slash-commands (.md) invocables con /.
├── skills/                  Skills técnicas cargadas on-demand por matching semántico.
├── skills-draft/            Skills en borrador, NO indexadas.
├── agents/                  Subagentes con rol específico y tools allowlist.
└── scheduled_tasks.lock     (gitignored) estado local.
```

⚠️ **Heads up**: `.claude/README.md` y algunas skills traen contenido residual del repo upstream (RindePlus / FastAPI / Alembic / Python 3.12). Lo del stack real es lo de este documento + [`backend.md`](./backend.md). Esa página irá actualizándose; mientras tanto, el contrato técnico de cómo funcionan las skills, hooks y agents sí aplica.

## Hooks

Source: [`../.claude/hooks/`](../.claude/hooks/) + registrados en `settings.json`.

| Hook | Evento | Qué hace |
|---|---|---|
| `branch-context.sh` | `UserPromptSubmit` | Inyecta en el prompt el estado actual de git: rama, status, lista de feature branches abiertas con su último commit subject. El agente lo lee antes de actuar. |
| `pre-commit-validate.sh` | `PreToolUse` (Bash `git commit`) | **Bloquea** commit si la rama es protegida (`main`/`develop`/`master`) o si el mensaje no cumple `^(feat|fix|chore|refactor|docs|test|style|perf|ci|build)(\(scope\))?!?: .+`. |
| `session-start.sh` | `SessionStart` | Alerta si hay otra sesión Claude activa (detecta via lockfile). Útil para evitar pisar trabajo entre dos sesiones. |
| `stop.sh` | `Stop` | Recuerda al final de cada turno si hay cambios sin commitear. |

Los hooks son shell scripts. Se pueden correr standalone con `CLAUDE_PROJECT_DIR=$(pwd) .claude/hooks/branch-context.sh` para debug.

**Reglas**:
- Cambios a hooks afectan a todo el equipo → requieren PR.
- No bypass-ear `pre-commit-validate` con `--no-verify` salvo permiso explícito documentado.

## Skills

Las skills son módulos de conocimiento que Claude carga cuando matchea semánticamente el prompt del usuario. Cada una vive en `.claude/skills/<nombre>/SKILL.md` con frontmatter (`name`, `description`).

| Skill | Trigger principal |
|---|---|
| `ui-design` | Diseño UI/UX e implementación frontend (paletas, dashboards, componentes React, Tailwind, accessibility). |
| `backend-endpoint` | Crear / modificar / testear endpoints, schemas Pydantic, guards, autenticación. |
| `db-migration` | Cambios de schema o data: nueva migración, backfill, rollback, coordinación con deploy. |
| `self-review-checklist` | Checklist de auto-revisión antes de cerrar tarea: tests, lint, diff limpio, secretos, criterios de aceptación. |

⚠️ Algunas skills (`backend-endpoint`, `db-migration`) describen el stack del repo upstream (FastAPI + Alembic). En CargoLink el stack es NestJS + Prisma — los **principios** de las skills (testear endpoints, validar input, planificar migraciones reversibles, backups antes de cambios destructivos) siguen siendo aplicables; los comandos puntuales no.

### Skills borrador

`.claude/skills-draft/` contiene skills no indexadas (no las dispatchea Claude). Hoy: `agronomia/` (heredada del upstream; no aplica a CargoLink). Está sin indexar a propósito.

### Cómo agregar una skill nueva

1. **Justificá primero** — si una existente cubre el 80% del caso, mejor extenderla. Las descriptions combinadas comparten un budget de ~1536 chars; agregar skills baratas degrada el matching de las demás.
2. Crearla en `.claude/skills/<nombre>/SKILL.md` con frontmatter completo. Description con verbos + objetos + keywords del dominio.
3. Probar el dispatch — pedile a Claude 2-3 tareas que deberían activarla; si no se activa, refinar la description.
4. PR a `develop` con scope `chore(claude)` o `feat(claude)`.

## Subagentes

Source: [`../.claude/agents/`](../.claude/agents/).

Subagentes con rol específico, tools allowlist y sin permisos destructivos.

### `qa-engineer.md`

| Aspecto | Detalle |
|---|---|
| Rol | QA formal al cerrar una feature/fix. Revisa el diff individual: tests, lint, convenciones, edge cases, criterios de aceptación, criterios de migración cuando hay alembic involucrado. |
| Cuándo se invoca | Automáticamente por `/pr` antes de abrir el PR. Si reporta BLOQUEANTES, `/pr` aborta y el main agent (vos) resuelve. |
| Output | `APROBADO` o lista priorizada de bloqueantes (archivo, línea, tipo de problema). |
| Tools | `Read`, `Grep`, `Glob`, `Bash` (solo test/lint). Sin `Write`/`Edit`. |

### `release-engineer.md`

| Aspecto | Detalle |
|---|---|
| Rol | Análisis agregado del release antes de abrir PR `develop → main`. No revisa código línea por línea (eso ya pasó por `qa-engineer` en cada PR previo); emite un informe estructurado con migraciones clasificadas por riesgo, breaking changes detectados, release notes desde conventional commits y checklist operacional. |
| Cuándo se invoca | Automáticamente por `/release` antes de `gh pr create`. Su output es el body del PR de release. |
| Output | Informe Markdown con 5 secciones fijas: Resumen / Migraciones / Breaking changes / Release notes / Checklist operacional. |
| Tools | `Read`, `Grep`, `Glob`, `Bash` (solo `git diff`, `git log`, `gh pr view/list`). Sin `Write`/`Edit`, sin `gh pr merge/create/review`, sin `alembic`. |

⚠️ Como las skills, los agents fueron escritos pensando el stack del upstream (alembic). En CargoLink la equivalencia es Prisma migrations bajo `backend/prisma/migrations/` — el principio "clasificar migraciones por riesgo" sigue valiendo.

## Slash-commands

Source: [`../.claude/commands/`](../.claude/commands/).

Los slash-commands son shortcuts para flujos repetitivos. Se invocan tipeando `/<nombre>` en Claude Code.

### Lifecycle de feature branch

| Comando | Qué hace |
|---|---|
| `/branch-new [desc]` | Crea feature branch desde `develop`, pregunta si usar worktree aislado. |
| `/branch-switch` | Lista feature branches abiertas y switchea a la elegida. |
| `/worktree-new [slug]` | Crea worktree aislado con feature branch desde `develop`. |
| `/sync` | Trae últimos cambios de `origin/develop` a la rama actual (solo fast-forward). |
| `/commit` | Arma commit con mensaje conventional desde el diff staged. |

### Cerrar feature

| Comando | Qué hace |
|---|---|
| `/pr [--skip-qa]` | Invoca `qa-engineer` automáticamente, después push + `gh pr create --base develop`. `--skip-qa` solo para cambios triviales. |
| `/pr-status` | Estado, CI, reviews y comentarios del PR actual. |
| `/merge-pr <N>` | Mergea PR a `develop` tras aprobación explícita del user, borra rama remota y limpia local. |

### Release

| Comando | Qué hace |
|---|---|
| `/release` | Abre PR `develop → main`. **Nunca** mergea ni aprueba — eso lo hace el mantenedor humano manualmente desde GitHub. |

### Mantenimiento

| Comando | Qué hace |
|---|---|
| `/prune-branches` | Borra ramas locales ya mergeadas a `develop` (con confirmación). |

### Integración con upstream (RindePlus)

| Comando | Qué hace |
|---|---|
| `/upstream-pending` | Lista commits del upstream pendientes de portear. |
| `/upstream-port` | Portea un commit upstream adaptado a la estructura de este repo. |

⚠️ Estos dos comandos asumen que existe un remote `upstream`. En CargoLink hoy **no** existe ese remote — son inútiles tal cual. Si vas a portar algo de otro repo (CargoLink vino fork-eado), agregalo con `git remote add upstream <url>`.

### Cómo agregar un slash-command

1. Discutir antes — si un existente cubre el 80%, extenderlo.
2. Crear `.claude/commands/<nombre>.md` con frontmatter `description` y `argument-hint` (si aplica).
3. Body: instrucciones específicas para Claude (no explicación para humanos). Pasos numerados, comandos concretos, qué hacer ante errores.
4. Agregarlo a [`../CLAUDE.md`](../CLAUDE.md) sección "Slash-commands disponibles".
5. PR a `develop` con scope `chore(claude)` o `feat(claude)`.

## Flujo end-to-end de trabajo con Claude

```
git checkout develop
git pull origin develop

# 1. crear feature
/branch-new "fix offset del dropdown empresas"
# → te crea fix/empresas-dropdown-offset

# 2. trabajar normalmente — Claude carga las skills pertinentes solo
# (skill: backend-endpoint si tocás un controller, ui-design si tocás frontend, etc.)

# 3. al final, commitear
/commit
# → te arma el mensaje conventional desde el diff

# 4. abrir PR (qa-engineer corre automáticamente)
/pr
# → invoca qa-engineer, si aprueba: push + gh pr create --base develop
# → si bloquea: te dice qué arreglar y aborta

# 5. revisar status
/pr-status

# 6. mergear cuando esté aprobado por humano
/merge-pr 42
```

Para release:

```
# desde develop actualizado
/release
# → invoca release-engineer, genera informe, abre PR develop→main
# → el merge a main lo hace un humano desde GitHub (NUNCA Claude)
```

## Reglas duras

Algunas reglas críticas (también en CLAUDE.md):

1. **Claude nunca mergea ni aprueba un PR contra `main`** — el hook `PreToolUse` bloquea `gh pr merge` y `gh pr review --approve` cuando el PR apunta a main. El merge lo hace el mantenedor humano desde GitHub.
2. **Claude nunca abre un PR con `--base main` desde una rama feature**. El `/release` lo abre solo si la rama de origen es `develop` (es el único caso válido).
3. **No editar código directamente en `main` o `develop`**. Siempre via feature branch + PR.
4. **No `git push --force` a `main` o `develop`**.
5. **No `--no-verify` en commit**. Si el hook bloquea, hay una razón.
6. **Acciones destructivas requieren confirmación del user**: `git reset --hard`, `git branch -D`, borrado de PRs, rebases que reescriban historia publicada.

## Worktrees

Cuando querés dos sesiones Claude en paralelo sobre features distintas sin pisarse:

```bash
# desde develop actualizado
/worktree-new fix-tracking-bug
# → crea ../CargoLink-fix-tracking-bug/ con la rama fix/fix-tracking-bug
# → reportá al user para que abra una nueva sesión Claude en ese directorio
```

Ojo: la DB Docker y el stack de compose son compartidos entre worktrees (solo uno puede tener el stack levantado a la vez salvo que cambies `COMPOSE_PROJECT_NAME` y los puertos en `.env`).

## Validación de commits fuera de Claude Code

Si commiteás desde tu IDE o desde una terminal sin Claude, los hooks de Claude no aplican. Para tener la misma validación, podés opt-in al hook git nativo:

```bash
git config --local core.hooksPath .githooks
```

(Hoy, `.githooks/commit-msg` valida formato conventional. Si no existe, esa opción simplemente no hace nada.)

## Referencias

- [`../CLAUDE.md`](../CLAUDE.md) — reglas operativas detalladas.
- [`../.claude/README.md`](../.claude/README.md) — guía interna de ownership de cada pieza.
- [Claude Code docs](https://code.claude.com/docs/) — referencia oficial de Anthropic.
