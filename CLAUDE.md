# Guía de trabajo para Claude — CargoLink

Estas reglas rigen cómo Claude (y quien use Claude Code en este repo) debe operar sobre el código, las ramas, los commits, los PRs y la arquitectura de asistencia de IA. Un hook `UserPromptSubmit` inyecta en cada turno el estado actual de git (rama, status, feature branches abiertas). **Leelo antes de actuar.**

## Qué es CargoLink

**Plataforma digital de gestión de transporte de carga por carretera (road freight)**. Conecta dadores de carga (shippers, rol `CARGO_GENERATOR`) con transportistas (carriers, rol `TRANSPORTER`), más un rol `ADMIN`. El flujo central: un shipper publica una carga (`Load`), los carriers se postulan (`Postulation`, con negociación de precio), al asignarse se abre un viaje (`Trip`) con tracking GPS, hay chat por WebSockets (`Message`) y al cerrar el viaje ambas partes se califican (`Rating`). Dominio = logística de transporte de cargas.

Este mínimo de contexto alcanza para la mayoría de las tareas. Para detalle de dominio (estados de carga/viaje/postulación, flujo de bidding, tracking) existe la skill `logistica` como borrador no-indexado en `.claude/skills-draft/logistica/`.

## Stack técnico

| Capa | Stack |
|---|---|
| **Mobile** | React Native 0.73 · Expo SDK 50 · TypeScript · react-navigation · react-native-maps · expo-location · expo-notifications · zustand · axios · socket.io-client |
| **Web** (`frontend/`) | Next.js 14 (App Router) · React 18 · TypeScript `strict: true` · Tailwind · zustand · @tanstack/react-query · axios · react-hook-form · zod · leaflet/react-leaflet · socket.io-client · lucide-react |
| **Backend** (`backend/`) | NestJS 10 · Prisma 5 · JWT (@nestjs/jwt + passport-jwt) · Socket.IO (@nestjs/websockets) · Swagger · class-validator/class-transformer · bcrypt · nodemailer |
| **Base de datos** | PostgreSQL 15 (vía Prisma — schema en `backend/prisma/schema.prisma`, migraciones en `backend/prisma/migrations/`, seed en `backend/prisma/seed.ts`) |
| **Infra / dev** | Único `docker-compose.yml` en la raíz (`postgres` :5432, `backend` :3001, `frontend` :3000) para dev local · prod y dev en un VPS propio con Docker Compose + Cloudflare Tunnel, deploy continuo con runner self-hosted (`deploy/vps/`) |
| **Tests** | jest en las tres capas: backend (`*.spec.ts`), web (`jest` + @testing-library/react) y mobile (`jest-expo` + @testing-library/react-native) |

Comandos útiles de referencia:

- Web: `cd frontend && npm test` (jest), `npm run lint`, `npm run build`. Dev local: `npm run dev` (puerto 3003).
- Backend: `cd backend && npm test` (jest), `npm run lint` (eslint). Prisma: `npm run prisma:generate`, `npm run prisma:migrate` (`prisma migrate dev`), `npm run prisma:seed`, `npm run prisma:studio`.
- Stack completo: `docker compose up -d`, `docker compose down`. Endpoints locales: Frontend http://localhost:3000, API http://localhost:3001/api, Swagger http://localhost:3001/api/docs, Postgres localhost:5432.
- Logs: `docker compose logs backend`, `docker compose logs frontend`.
- Migraciones dentro del contenedor: `docker compose exec backend npx prisma migrate deploy` (es lo que corre el `docker-entrypoint.sh` al startup).

Todo el código es TypeScript (web, mobile y backend). No hay Python en ningún lado. Respetá la configuración `strict` del `tsconfig.json` del frontend.

### Plugins opcionales recomendados (opt-in per-usuario)

Cada colaborador puede instalarlo en su máquina; no se versiona en el repo porque es una herramienta genérica del entorno, no una convención del producto. Viene del marketplace oficial de Anthropic y da diagnostics de tipos en tiempo real:

```bash
/plugin install typescript-lsp@claude-plugins-official
```

| Plugin | Para qué sirve |
|---|---|
| `typescript-lsp` | Chequeo de tipos post-edit sobre los archivos `.ts`/`.tsx` de web, mobile y backend (todo TypeScript; `strict: true` activo en el frontend — los errores de tipos son duros). |

No recomendamos otros plugins del marketplace oficial porque se superponen con nuestras propias piezas (`/commit`, `/pr`, `qa-engineer`, etc.). Si encontrás un plugin que sí sume valor y no duplica, proponelo y evaluamos.

## Arquitectura de IA en este repo

Adoptamos **un main agent** (vos) apoyado en **skills on-demand** + **dos subagentes con rol específico** (uno de QA por feature, uno de análisis de release), ambos sin permisos de modificación.

Por qué este diseño:
- Las tareas típicas del producto cruzan frontend + backend + DB en el mismo cambio. Un agente por capa obliga a coordinar, sin beneficio claro.
- Un main + skills concentra el contexto del repo en un solo lugar. Skills se cargan solo cuando el matching semántico las activa → no pagás el costo de todas al mismo tiempo.
- Un subagente de QA en contexto aislado permite correr validación sin contaminar el contexto del main.

**Cuándo cargar una skill vs delegar al subagente qa-engineer:**
- Skill = necesitás conocimiento específico para **hacer** algo (construir un componente frontend, armar un endpoint, escribir una migración).
- qa-engineer = **validar** al final que lo hecho cumple criterios, antes de abrir PR.

**Límite técnico a tener en cuenta:** las descriptions combinadas de todas las skills comparten un budget de ~1.536 chars en el dispatch de Claude Code. Con nuestras ~4-5 skills actuales sobra, pero si crecemos mucho, priorizar descriptions cortas con keywords específicos.

## Skills disponibles

> Los `SKILL.md` son fuente de verdad. Esto es solo un índice de triggers.
>
> **Estado:** las skills técnicas están en construcción. La skill de dominio `logistica` está como borrador no-indexado en `.claude/skills-draft/logistica/` hasta que el equipo de producto la revise.

| Skill | Path | Trigger principal |
|---|---|---|
| `ui-design` | `.claude/skills/ui-design/SKILL.md` | Diseño UI/UX + implementación frontend: paletas de color, tipografía, dirección estética, dashboards, charts, mapas, accesibilidad, rediseños. También componentes React, páginas Next.js, hooks, layouts, estilos Tailwind, estado con zustand/react-query, y pantallas mobile React Native/Expo. |
| `backend-endpoint` | `.claude/skills/backend-endpoint/SKILL.md` | Crear, modificar o testear endpoints NestJS: controllers, services, DTOs (class-validator), queries Prisma, guards JWT/autorización por rol, decoradores Swagger. Módulos bajo `backend/src/`. |
| `db-migration` | `.claude/skills/db-migration/SKILL.md` | Cambios de schema o data con Prisma: editar `schema.prisma`, `prisma migrate dev`, `prisma migrate deploy`, seed, rollback. Toca `backend/prisma/`. |
| `self-review-checklist` | `.claude/skills/self-review-checklist/SKILL.md` | Antes de dar por cerrada una tarea — checklist de tests (jest), lint (eslint/next lint), diff limpio, secretos, criterios de aceptación. |

## Subagentes

Este repo tiene **dos** subagentes con roles distintos. Ambos con tools allowlist y sin permisos destructivos.

### `qa-engineer` — feature → develop

**Rol:** pasada formal de QA al cerrar una feature o fix. Revisa el diff individual del PR: tests, lint, convenciones, edge cases, criterios de aceptación, y **aplica los criterios de la skill `db-migration`** cuando el diff toca `backend/prisma/migrations/**`.

**Cuándo se invoca:** automáticamente por `/pr` antes de abrir el PR. Si reporta BLOQUEANTES, `/pr` aborta y el main resuelve.

**Salida:** `APROBADO` o lista priorizada de bloqueantes (archivo, línea, tipo de problema).

**Herramientas:** `Read`, `Grep`, `Glob`, `Bash` (solo test/lint). Sin `Write`/`Edit`.

**Path:** [`.claude/agents/qa-engineer.md`](./.claude/agents/qa-engineer.md).

### `release-engineer` — develop → main

**Rol:** análisis **agregado** del release antes de abrir el PR `develop → main`. No revisa código individual (eso ya pasó por `qa-engineer` en cada PR previo). Emite un **informe estructurado** con: migraciones Prisma incluidas clasificadas por riesgo (🟢/🟡/🔴), breaking changes detectados en la API NestJS (endpoints removidos, DTOs alterados, columnas de modelos Prisma eliminadas), release notes borrador desde conventional commits agrupados por tipo, y checklist operacional para el mantenedor humano.

**Cuándo se invoca:** automáticamente por `/release` antes de `gh pr create`. Su output es el body del PR de release.

**Salida:** informe Markdown con 5 secciones fijas (Resumen / Migraciones / Breaking changes / Release notes / Checklist operacional).

**Herramientas:** `Read`, `Grep`, `Glob`, `Bash` (solo `git diff`, `git log`, `gh pr view/list`). Sin `Write`/`Edit`, sin `gh pr merge/create/review`.

**Path:** [`.claude/agents/release-engineer.md`](./.claude/agents/release-engineer.md).

## Decisiones estructurales

Las decisiones técnicas del repo (arquitectura, stack, patrones, políticas) se documentan en [`docs/`](./docs/) — ver el índice en [`docs/README.md`](./docs/README.md). El workflow de Claude Code tiene su propio mapa narrativo en [`docs/workflow-claude-code.md`](./docs/workflow-claude-code.md).

**Regla:** antes de proponer un cambio estructural (elección de framework, patrón arquitectónico, modelo de datos con impacto amplio, política de branching/deploy), revisá si la doc existente lo cubre o lo contradice; si decidís algo nuevo, dejalo escrito en `docs/` y referencialo desde el PR.

## Branch model — gitflow

- `main` → producción. Solo recibe PRs desde `develop`.
- `develop` → integración. Solo recibe PRs desde feature branches.
- `feature branches` → todo el trabajo vive acá.

> **REGLA DURA — CLAUDE NUNCA ABRE UN PR CONTRA `main`.**
> Base default y **sin excepción**: `develop`. Los PRs de `develop → main`
> los maneja **el mantenedor humano manualmente**, fuera de Claude Code.
> Esta regla aplica incluso si estás en la rama `develop` o si el usuario
> lo pide explícitamente — si ocurre ese pedido, explicá que es una
> operación de release que requiere decisión humana.

**Prohibido:**
- Commitear o editar código directamente en `main` o `develop`.
- Hacer `git push --force` a `main` o `develop`.
- **Abrir un PR con `--base main`** (desde cualquier rama, incluida `develop`).
- Saltar `develop` para mergear una feature directo a `main`.

## Naming de ramas

Formato: `<type>/<kebab-case-description>`

`type` ∈ `{feat, fix, chore, refactor, docs, test}`.

Ejemplos:
- `fix/trips-gps-coordinate-rounding`
- `feat/loads-status-filtering`
- `chore/align-compose-ports`

## Commits — conventional commits en inglés

Formato: `type(scope): description`

- Tipos: los mismos que los de rama.
- `scope`: opcional, minúsculas, entre paréntesis. Ej. `(loads)`, `(trips)`, `(auth)`, `(docker)`.
- `description`: **en inglés**, minúsculas, imperativo, sin punto final.

Ejemplos:
- `feat(loads): add load filtering by status`
- `fix(trips): correct GPS coordinate rounding`
- `fix(auth): scope carrier dashboard to own trips`
- `chore(docker): align compose ports with env`

No uses `--no-verify` ni `--no-gpg-sign` a menos que el usuario lo pida explícitamente.

### Al commitear — siempre

1. **Camino preferido:** usá `/commit`. Te guía a armar un mensaje conventional correcto desde el diff staged.
2. **Camino manual** (cuando no uses `/commit`): seguí el mismo check — inferí `type` + `scope` del diff, escribí `description` en inglés imperativo, confirmá con el usuario antes de ejecutar, y pasá el mensaje como heredoc.
3. Un **hook `PreToolUse`** intercepta cada `git commit`:
   - **Bloquea** si la rama actual es protegida (`main`/`develop`/`master`).
   - **Bloquea** si el mensaje no cumple `^(feat|fix|chore|refactor|docs|test|style|perf|ci|build)(\(<scope>\))?!?: .+`.
   - Si el hook bloquea, leé el error, corregí y reintentá. **No** bypassees con `--no-verify`.

## Cómo actuar según la rama actual

El hook te dice la rama actual y lista feature branches abiertas con el subject de su último commit. Tu comportamiento cambia:

### Regla general — cómo decidir rama antes de modificar código

**Cuando el usuario pida algo que implique modificar código (editar, crear archivos, commitear, refactor, bug fix, feature nueva)**, no escribas recomendaciones en prosa — evaluás el contexto siguiendo este árbol y ejecutás el **Flujo automático: selectores de rama + worktree** (ver más abajo) cuando corresponda:

1. **Rama actual matchea el scope del pedido** (feature branch cuyo nombre o último commit subject corresponde a lo que pide el user) → seguí trabajando en ella sin preguntar. **No** disparás el flujo.

2. **Rama actual es protegida** (`main` / `develop` / `master`) → **disparás el Flujo automático**. Antes de abrir el Selector 1, evaluás dos señales para decidir qué opción marcar como `(Recomendado)` en el selector:
   - ¿Hay alguna feature branch abierta (en la lista que inyecta el hook) cuyo nombre o último commit subject matchee el scope del pedido? → recomendá **"Usar una existente"** y en el Selector 1b ponela como top candidata.
   - Si ninguna matchea → recomendá **"Crear nueva rama"** e inferí `<type>/<slug>` (type ∈ `{feat, fix, chore, refactor, docs, test}`; slug kebab-case, 2-4 palabras) para la description de esa opción.

3. **Rama actual es feature pero NO matchea** (ej. estás en `fix/dropdown-offset` y piden tocar autenticación) → avisá al user que el scope actual no matchea, ofrecé `git stash` o commit si hay cambios sin commitear, y después **disparás el Flujo automático** (las mismas señales del punto 2 aplican para decidir qué recomendar en el Selector 1). No mezcles scopes en una sola rama.

### Si la rama es `main`, `develop` o `master` (protegida)

**No edites archivos ni crees commits.** Disparás el **Flujo automático: selectores de rama + worktree** (ver abajo). No escribas la recomendación en prosa — los selectores la reemplazan.

### Si la rama es feature y matchea el pedido

Trabajá directo. Al final del cambio, ofrecé `/pr` para abrir el PR contra `develop`.

### Excepción — preguntas conversacionales o exploratorias

Preguntas que **no requieren editar código** (explicar algo, buscar archivos, leer docs, "cómo funciona X", "qué hace Y", "mostrame Z") se responden normalmente **sin** pedir cambio de rama ni disparar el flujo. La regla solo activa cuando hay intención explícita de modificar el repo.

### Flujo automático: selectores de rama + worktree

Cuando se dispara (ver trigger abajo), presentás **dos selectores interactivos secuenciales** usando `AskUserQuestion`. Nunca escribas la recomendación en prosa cuando este flujo aplica — reemplaza el formato `Rama recomendada:` / `Comando:` anterior.

#### Trigger

Se activa cuando **todas** se cumplen:

1. El pedido del usuario implica **modificar código** (editar/crear archivos, commitear, refactor, bug fix, feature nueva).
2. La rama actual es **protegida** (`main` / `develop` / `master`) **O** es una feature branch cuyo nombre + último commit subject **no matchean con el scope del pedido**.

Señal práctica del trigger: la advertencia de rama protegida (el bloque `⚠️ **PROTEGIDA — ...**`) que inyecta el hook `branch-context.sh`, o tu propio juicio de que la feature actual no corresponde al scope. Cuando dispara, pasás **directo a Selector 1** — no escribas prosa de recomendación antes.

#### Precondición — working tree limpio

Antes de abrir selectores, revisá `git status --short`. Si hay cambios sin commitear:
- Avisá al user y ofrecé commit/stash primero.
- **No** abras los selectores sobre un working tree sucio — un checkout subsecuente podría pisar trabajo.

#### Nombre propuesto para "Crear nueva"

Inferí `<type>/<slug>` del último mensaje del user + commits recientes:
- `type` ∈ `{feat, fix, chore, refactor, docs, test}` según la intención.
- `slug` en `kebab-case`, 2-4 palabras, del scope concreto.

Ese nombre va en la `description` de la opción "Crear nueva rama" del Selector 1 para que el user lo vea antes de confirmar.

#### Selector 1 — Rama

Pregunta: `¿Qué hacer con la rama?` · Header: `Rama`

Opciones según estado:

- Siempre: **Crear nueva rama** — description: `Nombre propuesto: <type>/<slug>. Desde origin/develop actualizado.`
- Solo si hay ≥1 feature branches no mergeadas a `develop` (locales o remotas): **Usar una existente** — description: `Elegís cuál en el próximo paso.`
- Siempre: **Cancelar** — description: `No cambio rama, no modifico código.`

**Marcá `(Recomendado)` en el label** según contexto:
- Si detectaste una rama existente que matchea el scope → "Usar una existente (Recomendado)" y ponela primero.
- Sino → "Crear nueva rama (Recomendado)" primero.

Si no hay feature branches abiertas, la opción "Usar una existente" se **omite** (no tendría qué listar) — solo 2 opciones.

#### Selector 1b — Elegir rama existente (condicional)

Dispara solo si en Selector 1 el user eligió "Usar una existente".

Listá feature branches no mergeadas a `develop` con:
```bash
git for-each-ref --no-merged=origin/develop \
  --sort=-committerdate \
  --format='%(refname:short) | %(committerdate:relative) | %(subject)' \
  refs/heads/ refs/remotes/origin/ \
  | grep -vE '^(main|develop|master|origin/main|origin/develop|origin/master|origin/HEAD) '
```

Pregunta: `¿Cuál rama retomás?` · Header: `Elegir rama`

Opciones:
- Hasta 3 candidatas por recencia + relevancia al scope (vos juzgás el ranking).
- Si hay más de 3: el user puede usar "Other" (free-text) para nombrar cualquiera.
- **Crear nueva en su lugar** — fallback si se arrepintió.

Si resultara que no hay ninguna existente (no debería ocurrir porque Selector 1 la habría ocultado, pero defensivamente): selector con 2 opciones — "Crear nueva rama" / "Cancelar".

#### Selector 2 — Worktree

Dispara **después** de que Selector 1 (y 1b si aplicó) resuelvan la decisión de rama, **salvo que el user haya cancelado**. Si canceló → parás acá.

Pregunta: `¿Aislar la rama en un worktree?` · Header: `Worktree`

Opciones según estado:

- Siempre: **Crear nuevo worktree** — description: `Directorio hermano \`../CargoLink-<slug>\`. Útil si ya hay otra sesión Claude activa.`
- Solo si hay worktrees secundarios vivos (`git worktree list --porcelain` devuelve más que el principal): **Usar worktree existente** — description: `Elegís cuál en el próximo paso.`
- Siempre: **No usar worktree** — description: `Trabajo en el repo principal.`

**Marcá `(Recomendado)`** según contexto:
- Si el hook `SessionStart` reportó sesiones paralelas activas → "Crear nuevo worktree (Recomendado)" primero.
- Sino → "No usar worktree (Recomendado)" primero.

#### Selector 2b — Elegir worktree existente (condicional)

Dispara solo si en Selector 2 el user eligió "Usar worktree existente".

Listá `git worktree list` excluyendo el principal. Mismo patrón que Selector 1b (hasta 3 opciones + "Other" para más + "Crear nuevo en su lugar").

Si no hay ninguno (defensivo): selector con "Crear nuevo worktree" / "No usar worktree".

#### Ejecución final — routing

Después de que los selectores resuelvan, ejecutás la combinación (reusando los primitivos documentados en `/branch-new`, `/branch-switch`, `/worktree-new` — no dupliques lógica):

| Rama | Worktree | Acción |
|---|---|---|
| Crear nueva | No worktree | `git fetch origin` + `git checkout -b <type>/<slug> origin/develop`. |
| Crear nueva | Crear nuevo worktree | `git worktree add "$WT" -b <type>/<slug> origin/develop` + copiar el `.env` raíz si existe. Reportá que el user tiene que abrir otra sesión Claude en el worktree — **no hagas `cd` vos**. |
| Crear nueva | Worktree existente | Pedí al user `cd` al worktree; dentro, `git checkout -b <type>/<slug> origin/develop`. Avisá si el worktree tiene otra rama check-out-eada (posible conflicto). |
| Existente | No worktree | `git checkout <rama>` si es local; `git checkout -b <rama> origin/<rama>` si es solo remota. |
| Existente | Crear nuevo worktree | `git worktree add "$WT" <rama>` si la rama es local; `git worktree add "$WT" -b <rama> origin/<rama>` si es solo remota (evita worktree en detached-HEAD). |
| Existente | Worktree existente | Pedí `cd` al worktree; verificá que la rama matchee o switcheá. |
| — | (Cancelar en cualquier paso) | Parás. No modificás nada. Recordale al user que la intención original quedó pendiente. |

#### Qué NO hace este flujo

- No asume defaults si el user no responde — esperás.
- No se activa en preguntas conversacionales/exploratorias (regla arriba intacta).
- No se activa cuando la rama actual matchea el scope (seguís trabajando sin preguntar).
- No cubre borrar ramas ni limpiar worktrees — esos están en `/prune-branches` y comandos git directos.

## Protocolo al cerrar una feature

Orden end-to-end al terminar el trabajo de una feature:

1. **Hook `Stop`** se dispara al final de cada turno: si hay cambios sin commitear, te avisa con un recordatorio.
2. **`/commit`** → armás el commit con mensaje conventional desde el diff staged. El hook `PreToolUse` bloquea si la rama es protegida o el mensaje no cumple formato.
3. **(Opcional) Skill `self-review-checklist`** → pasada personal previa a QA formal: tests locales, lint, diff limpio, secretos, criterios de aceptación.
4. **`/pr`** → **invoca automáticamente al subagente `qa-engineer`** en el primer paso. Si devuelve `APROBADO`, el comando sigue con push + `gh pr create --base develop`. Si devuelve `BLOQUEANTES`, el comando aborta y volvés al main para resolver, luego re-corrés `/pr`.
5. **`/merge-pr <N>`** → una vez abierto, pide confirmación explícita al user para mergear a `develop`, mergea con `--merge --delete-branch` y limpia la rama local. Ofrece abrir `/release` después si hay cosas en develop que aún no están en main.
6. **`/release`** (opcional, cuando corresponda hacer release) → abre PR `develop → main`. **Nunca aprueba ni mergea** — el merge a main lo hace el mantenedor humano manualmente desde GitHub.

Para la racional completa del workflow, ver [`docs/workflow-claude-code.md`](./docs/workflow-claude-code.md).

## Flujo de PR

Para cerrar una feature:

1. Asegurate de que el working tree esté limpio.
2. Ejecutá `/pr`. Internamente:
   - **Paso automático**: delega al subagente `qa-engineer` con el diff y los criterios. Si bloquea, el comando aborta.
   - `git push -u origin <rama>` si la rama no tiene upstream.
   - `gh pr create --base develop --head <rama> --title "<conventional title>" --body "<body>"`.
3. El título del PR sigue el mismo formato de conventional commits.
4. El body incluye: summary en 1-3 bullets, lista de commits, sección **QA** (APROBADO o skipped), y test plan.

**Flag `--skip-qa`**: solo para cambios triviales (typos, docs puros, bumps de versión sin cambio funcional). Uso explícito, queda en el historial del comando y en el body del PR. Si sospechás que el cambio no es trivial, avisá antes.

**Base del PR**: siempre `develop`. **Sin excepción**. El hook `PreToolUse` bloquea duro si intentás abrir/mergear/aprobar un PR contra `main`. Para release, `/release`.

## Flujo de release (develop → main)

Cuando `develop` tiene cambios listos para producción:

1. **`/release`** confirma con el user y delega al subagente **`release-engineer`**.
2. **`release-engineer`** produce un informe estructurado con:
   - **Migraciones Prisma incluidas** clasificadas por riesgo (🟢 bajo / 🟡 medio / 🔴 alto). Importante porque el contenedor del backend corre `npx prisma migrate deploy` automáticamente al arrancar (en el `docker-entrypoint.sh`) — todo lo listado ahí se va a aplicar sin intervención manual cuando el server levante la imagen `:prod`.
   - **Breaking changes** detectados en la API NestJS (endpoints removidos, DTOs alterados, columnas de modelos Prisma eliminadas).
   - **Release notes** borrador desde conventional commits agrupados por tipo (feat / fix / refactor / docs / tests / chore).
   - **Checklist operacional** para el mantenedor humano (rollback plan, coordinación, smoke test post-deploy, comunicación).
   - **Si hay migraciones 🟡/🔴** (cambios destructivos: drop column/table, renames), el checklist lo resalta. El pipeline de prod toma un backup automático justo antes de levantar la versión nueva (y aborta si falla); para 🔴 además hay que probar el restore en dev antes del merge — ver [`docs/deployment.md`](./docs/deployment.md) § "Backups" y "Rollback".
3. `/release` abre el PR `develop → main` con ese informe como body.
4. **Claude no mergea ni aprueba ese PR.** Regla dura — está en el hook, en este documento y en el slash-command. El merge a `main` lo hace el mantenedor humano desde GitHub con su propia cuenta.
5. El user revisa el PR (con visibilidad concreta de lo que va a pasar gracias al informe), lo aprueba con su cuenta (o con la de otro reviewer), y lo mergea manualmente.
6. **Al mergear a `main`, el deploy a prod es automático.** El workflow [`.github/workflows/deploy-vps.yml`](./.github/workflows/deploy-vps.yml) corre en un **runner self-hosted dentro del VPS** (`ubuntu-tesis01`) y ejecuta [`deploy/vps/deploy.sh`](./deploy/vps/deploy.sh) sobre el clone de prod (`~/cargolink`): fast-forward a `main` → build de backend y frontend → **backup de la DB** → `docker compose up -d` (las migraciones corren al arrancar) → healthcheck contra `https://plataforma.cargolink.com.ar`. Publicado vía Cloudflare Tunnel; sin secretos en GitHub. Detalle en [`docs/ci-cd.md`](./docs/ci-cd.md) y la decisión en [`docs/decision-deploy-vps.md`](./docs/decision-deploy-vps.md).

**Entorno `dev`**: el merge a `develop` dispara el mismo workflow contra el clone de dev (`~/cargolink-dev`, proyecto compose `cargolink-dev`, https://dev.cargolink.com.ar), con su propia DB y secrets y sin backup pre-deploy.

**Runner self-hosted — regla dura**: nunca uses el runner (`runs-on: self-hosted` / `cargolink-vps`) en workflows que disparen con `pull_request`, ni agregues ese trigger a `deploy-vps.yml`: ejecutaría código no revisado en el VPS con acceso a Docker. GCP (Cloud Run + Cloud SQL) se apagó el 2026-09-14 y su workflow e infra se quitaron del repo: no los reintroduzcas.

**Por qué el merge a main es manual**: es la decisión humana ("quiero que esto entre a prod"). El merge dispara el deploy automático a prod en el VPS, pero la decisión de mergear sigue en manos del mantenedor.

## Slash-commands disponibles

Feature branch lifecycle:
- `/branch-new [descripción]` — crea feature branch desde `develop`, preguntando si usar worktree aislado (recomendado si hay sesiones Claude en paralelo).
- `/branch-switch` — lista feature branches abiertas y switchea a la elegida.
- `/worktree-new [slug]` — crea un worktree aislado con feature branch desde `develop` (lo que `/branch-new` hace cuando elegís worktree).
- `/sync` — trae últimos cambios de `origin/develop` a la rama actual (solo fast-forward).
- `/commit` — arma commit con mensaje conventional desde el diff staged.

Cerrar feature:
- `/pr [--skip-qa]` — invoca `qa-engineer` automáticamente, luego push + abre PR contra `develop`. `--skip-qa` solo para cambios triviales.
- `/pr-status` — estado, CI, reviews y comentarios del PR actual.
- `/merge-pr <N>` — mergea PR a `develop` tras aprobación explícita del user, borra la rama remota y limpia la local.

Release:
- `/release` — abre PR `develop → main`. **Nunca** mergea ni aprueba — esa decisión queda en manos del mantenedor humano.

Mantenimiento:
- `/prune-branches` — borra ramas locales ya mergeadas a develop (con confirmación).

Para onboarding rápido del equipo, ver [`.claude/README.md`](./.claude/README.md) — mapa de la carpeta y ownership de cada pieza.

## Worktrees para trabajo paralelo

Cuando querés tener dos sesiones Claude editando features distintas sin pisarse, usá `/worktree-new <slug>`. El hook `SessionStart` te avisa si detecta otra sesión Claude activa en el sistema.

**Compatibilidad**: cada worktree tiene su propia rama/HEAD; hooks, slash-commands y `CLAUDE.md` se propagan por git una vez mergeados a `develop`.

**Advertencia — recursos compartidos entre worktrees**:
- La **DB Postgres** (contenedor `postgres` del `docker-compose.yml`) es una sola. **No** corran `prisma migrate` simultáneamente desde dos worktrees — se pisan el schema.
- El stack `docker compose` es único. **Solo un worktree** puede tener el stack levantado a la vez.
- Para stacks paralelos reales, cambiá `COMPOSE_PROJECT_NAME` y los puertos en el `.env` del worktree. No viene resuelto por default.

## Validación de commits fuera de Claude Code

El repo provee un git hook opcional (`.githooks/commit-msg`) que valida el formato conventional commits cuando commiteás desde IDE o terminal (fuera de Claude). Es **opt-in**:

```bash
git config --local core.hooksPath .githooks
```

Lo hace cada dev en su clone/worktree. Dentro de Claude Code el hook `PreToolUse` ya cubre la validación.

## Convenciones de lenguaje

- **Español**: `CLAUDE.md`, skills (SKILL.md, content/), docs (`docs/`), `.claude/README.md`, comentarios internos que expliquen **por qué** algo se hace.
- **Inglés**: nombres de variables, funciones, clases, archivos de código, commits, títulos de PR. El código en este repo se lee en inglés; los commits del historial son todos en inglés.
- **Mixto OK**: body de PR puede ser español (contexto del cambio) aunque el título sea inglés.

Evitar: mezclar idiomas dentro de un mismo identificador (`crearViaje`, `createTrip` — elegí uno y aplicá consistente al módulo).

## Secretos y datos sensibles

**Nunca commitear**:
- Archivos `.env`, `.env.local` (todos los variantes). El repo versiona `.env.example` como plantilla — ese sí.
- Tokens de API (GitHub, etc.), llaves privadas, `JWT_SECRET`, `POSTGRES_PASSWORD`, credenciales SMTP o de servicios externos.
- Backups SQL con datos productivos reales (como `backup-*.sql`, ver `docs/base-de-datos.md`).
- Logs con PII o credenciales.

**Antes de `/commit`**: revisá `git diff --cached`. Si hay duda, parar.

Si detectás un secreto ya commiteado en la historia, **parar** y avisar al usuario — rotar el secreto + sacarlo del historial requiere coordinación (no es algo que Claude deba hacer solo).

El `.gitignore` del repo ya cubre los patrones comunes. Si agregás un nuevo tipo de archivo con secretos, actualizá el `.gitignore` primero antes de crear el archivo.

## Acciones que requieren confirmación explícita del usuario

- `git push --force` (incluso con `--force-with-lease`).
- `git reset --hard`.
- Borrar ramas (`git branch -D`, `git push origin --delete`).
- Cerrar o mergear PRs.
- Rebases interactivos que reescriban historia publicada.

Cuando estés por hacer uno de estos, **pará y preguntá** antes.
