# Contribuir

Reglas, convenciones y flujos para colaborar en CargoLink. El detalle técnico operativo vive en [`../CLAUDE.md`](../CLAUDE.md) (cuando trabajás con Claude Code); este documento es la versión "humana", consultable independientemente.

## Modelo de ramas (gitflow simplificado)

```
       main          ───●──────────●──────────●──────  (producción)
                        │          │          │
                       PR         PR         PR
                        │          │          │
       develop      ●──┴──●───●───┴──●───●───┴──●───  (integración)
                    │      │   │       │   │       │
                    │      │   │       │   │       │
       feature      ●─●─●─●    │       ●─●─●       ●─●  (trabajo)
                                │
                                ●─●─●─●  ←  feature branches
```

| Rama | Para qué | Quién mergea |
|---|---|---|
| `main` | Producción. Sólo recibe PRs desde `develop`. | Mantenedor humano (manualmente). |
| `develop` | Integración. Sólo recibe PRs desde feature branches. | El equipo. |
| Feature branches | Todo el trabajo del día a día. | Mergeo automatizable. |

### Reglas duras

- **PRs a `main` solo desde `develop`**. Nunca desde una feature branch.
- **Nadie commitea o editea código directamente en `main` o `develop`**. Siempre via feature branch + PR.
- **Nadie hace `git push --force` a `main` o `develop`**.
- El merge a `main` lo hace el **mantenedor humano** desde GitHub, no automatizado.

## Naming de feature branches

Formato: `<type>/<kebab-case-description>`

| `type` | Para |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Bug fix |
| `chore` | Tareas internas (deps, config, refactors menores) |
| `refactor` | Reorganización sin cambio de comportamiento |
| `docs` | Solo documentación |
| `test` | Sumar / arreglar tests |

Ejemplos del historial real:

- `fix/empresas-dropdown-license-bypass`
- `feat/migrate-lote-detail-module`
- `chore/upgrade-nextjs-to-15`
- `fix/map-pan-bounds`
- `fix/tracking-scope-by-user`

Description: minúsculas, kebab-case, 2-4 palabras. Sin sufijo (no `fix-12345`).

## Conventional commits

Formato del mensaje: `type(scope): description`

| Parte | Reglas |
|---|---|
| `type` | Mismos que `<type>/` de rama: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`. (También aceptados: `style`, `perf`, `ci`, `build`.) |
| `scope` | Opcional, entre paréntesis, minúsculas. Ej. `(auth)`, `(loads)`, `(empresas-dropdown)`. |
| `description` | **En inglés**, minúsculas, imperativo, sin punto final. |

### Ejemplos del repo

```
feat: migrate lote detail module + fix endpoint/frontend field mismatches
fix(gestion-licencias): scope admin licencias to user's org by default
fix(empresas-dropdown): unify license bypass handling
fix(tracking): add enabled guard and restrict GET /trips to ADMIN
fix(maps): constrain pan and zoom to keep the load route in view
```

### Body / footer opcionales

Si la descripción no alcanza, sumá body separado por una línea en blanco:

```
fix(api): handle missing emailVerified flag on legacy users

Some users created before migration 20260515223353 don't have the field
set; we now default it to false on load and prompt re-verification.

Refs #42
```

### Validación

Un hook intercepta cada `git commit` y bloquea si:
1. La rama es protegida (`main` / `develop` / `master`).
2. El mensaje no matchea `^(feat|fix|chore|refactor|docs|test|style|perf|ci|build)(\(scope\))?!?: .+`.

Si bloquea, leé el error y corregí — **no** uses `--no-verify` salvo permiso explícito.

Para validar fuera de Claude Code (commits desde IDE / terminal regular), opt-in al hook git nativo:

```bash
git config --local core.hooksPath .githooks
```

## Flujo de PR (`feature → develop`)

```
git checkout develop && git pull
git checkout -b feat/<slug>
# trabajar
git add -p && git commit          # mensaje conventional
git push -u origin feat/<slug>
gh pr create --base develop --title "feat: ..."
```

Si usás Claude Code, hay shortcuts:

| Slash-command | Reemplaza |
|---|---|
| `/branch-new "..."` | `git checkout develop && git pull && git checkout -b ...` |
| `/commit` | Inferir el mensaje del diff staged y commitear |
| `/pr` | Invoca subagente `qa-engineer` → si aprueba, push + `gh pr create --base develop` |
| `/pr-status` | `gh pr view` con CI + reviews |
| `/merge-pr <N>` | `gh pr merge N` con confirmación + cleanup local |

Detalle en [`workflow-claude-code.md`](./workflow-claude-code.md).

### Estructura del PR

Título: mismo formato que conventional commits.

Body (template básico en `.github/PULL_REQUEST_TEMPLATE.md`):
- **Summary** — 1-3 bullets de qué cambia y por qué.
- **Commits** — list, generalmente auto-llenado.
- **QA** — sección con el output de `qa-engineer` (APROBADO o skipped).
- **Test plan** — pasos para verificar manualmente.

### Flag `--skip-qa` en `/pr`

Solo para cambios **triviales**:
- Typos.
- Docs puros.
- Bumps de versión sin cambio funcional.

Su uso queda en el historial del comando y en el body del PR. Si sospechás que el cambio no es trivial, no uses el flag.

## Flujo de release (`develop → main`)

```
git checkout develop && git pull
/release       # invoca release-engineer, abre PR develop→main
```

El subagente `release-engineer` produce un informe que se convierte en el body del PR:

1. **Resumen** — qué entra al release.
2. **Migraciones** — clasificadas por riesgo (🟢 bajo / 🟡 medio / 🔴 alto).
3. **Breaking changes** — endpoints removidos, schemas alterados, columnas eliminadas.
4. **Release notes** — borrador agrupado por tipo (feat / fix / refactor / docs / tests / chore).
5. **Checklist operacional** — rollback plan, coordinación, smoke test post-deploy, backups obligatorios si hay migraciones 🟡/🔴.

**Claude no mergea el PR de release**. Lo hace el mantenedor humano manualmente desde GitHub:
- Revisa el informe.
- Aprueba con su cuenta (o pide review a otro).
- Mergea.
- Al merge, GitHub Actions buildea las imágenes `:prod` y las publica a GHCR — pero **el deploy a un server real es manual** (ver [`deployment.md`](./deployment.md)).

## Convenciones de lenguaje

| En | Idioma |
|---|---|
| `CLAUDE.md`, `docs/`, `.claude/README.md`, comentarios internos de "por qué" | **Español** |
| Nombres de variables, funciones, clases, archivos de código | **Inglés** |
| Commits, títulos de PR | **Inglés** |
| Body de PR | Español o inglés (consistente con la complejidad) |
| Mensajes de validación del usuario final (DTOs, emails) | Español |

Lo que **no** hacemos: mezclar idiomas dentro de un mismo identificador (`calcularRinde`, `calcularYield` → elegí uno y aplicalo consistente al módulo).

## Secretos y datos sensibles

**Nunca commitear**:

- `.env`, `.env.dev`, `.env.prod`, `.env.local` (todos los variantes).
- Tokens de API (GitHub, Google Maps, SMTP, etc.).
- Llaves privadas, credenciales de DB o de servicios externos.
- Backups SQL con datos productivos reales.
- Logs con PII o credenciales.

### Antes de commitear

Mirá `git diff --cached`. Si tenés dudas, parate y revisá.

### Si detectás un secreto ya commiteado

**No alcanza con borrar el commit** — el secreto está en la historia.

1. Rotarlo inmediatamente (cambiar la clave / regenerar el token).
2. Removerlo del historial con [`git filter-repo`](https://github.com/newren/git-filter-repo) o [`bfg-repo-cleaner`](https://rtyley.github.io/bfg-repo-cleaner/).
3. Force-push (esto requiere coordinación con el equipo — todos tienen que re-clonar).
4. Notificar a quien corresponda (proveedor del servicio, sobre todo si fue un token de API público).

El `.gitignore` del repo ya cubre los patterns comunes. Si agregás un nuevo tipo de archivo con secretos, actualizá `.gitignore` **antes** de crearlo.

## Acciones que requieren confirmación explícita

Cuando trabajás con Claude, estas acciones **siempre** piden confirmación antes:

- `git push --force` (incluso `--force-with-lease`).
- `git reset --hard`.
- Borrar ramas (`git branch -D`, `git push origin --delete`).
- Cerrar o mergear PRs.
- Rebases interactivos que reescriban historia publicada.

Si lo hacés a mano, mismo criterio: pensalo dos veces.

## Cómo lidiar con código de terceros / upstream

CargoLink **no tiene** un remote `upstream` configurado hoy. Si en el futuro se sincroniza con otro repo:

```bash
git remote add upstream <url>
git fetch upstream
```

Después podés usar los comandos `/upstream-pending` y `/upstream-port` de Claude (descritos en [`workflow-claude-code.md`](./workflow-claude-code.md)).

## Estilo de código

### TypeScript

- `strict: true` en todos los `tsconfig.json` — no relajarlo.
- Sin `any` salvo justificación documentada (`@ts-expect-error` con explicación).
- Sin export default salvo donde el framework lo exige (`app/**/page.tsx`).
- Path aliases (`@/*`) sobre relativos largos.

### NestJS

- Un módulo por dominio. Cross-domain via DI, no por imports directos.
- Validación con DTO + class-validator, no parseo manual.
- Errores con excepciones semánticas (`BadRequestException`, etc.), no `throw new Error()`.
- Decorators de Swagger (`@ApiTags`, `@ApiOperation`, `@ApiProperty`) en endpoints públicos.

### Prisma

- Una migración por cambio lógico.
- Naming descriptivo del slug (`add_email_verification`, no `update_v2`).
- No editar migraciones aplicadas. Si te equivocaste, hacé una nueva que corrija.

### Frontend

- Server components por default, `'use client'` solo cuando hay hooks o eventos.
- Tailwind para todo el estilo. Sin CSS-in-JS.
- React Hook Form + Zod para forms.
- TanStack Query para server state, Zustand para client state global.

### Mobile

- `AsyncStorage` para persistencia. (En el futuro: `expo-secure-store` para tokens.)
- React Navigation v6.
- `expo-location` para GPS.

## Cómo proponer un cambio arquitectónico

Cambios estructurales (elección de framework, patrón arquitectónico, modelo de datos con impacto amplio, política de branching/deploy) merecen una nota antes de implementar — en CLAUDE.md de RindePlus eso se canaliza vía ADRs (`docs/adr/`). En CargoLink hoy **no hay** carpeta `docs/adr/` — la convención no está adoptada todavía. Si querés impulsar la práctica:

1. Crear `docs/adr/README.md` con el formato.
2. Numerar las decisiones (`0001-titulo.md`, `0002-titulo.md`).
3. Cada ADR con 5 secciones estándar (Contexto / Decisión / Consecuencias / Alternativas / Estado).
4. Linkear desde el PR que la propone.

Mientras tanto: una sección "Contexto" larga en el PR + discusión en el review alcanza.

## Cosas que faltan (oportunidades para contribuir)

- Tests automatizados (Jest backend, Vitest frontend, Detox mobile).
- CI con lint + tests gating en `pull_request`.
- `LICENSE` (no hay declaración de licencia).
- `SECURITY.md` con política de reporte de vulnerabilidades.
- `CHANGELOG.md` o release notes formales.
- ADRs (ver arriba).
- Refactor de URLs hardcodeadas en mobile.
- Sincronizar `messagesApi` del mobile al modelo trip-based.
- Healthcheck del backend.
- Backups automáticos.

## Si tenés dudas

- Reglas operativas detalladas: [`../CLAUDE.md`](../CLAUDE.md).
- Workflow con Claude Code: [`./workflow-claude-code.md`](./workflow-claude-code.md).
- Arquitectura técnica: [`./arquitectura.md`](./arquitectura.md).
- Setup local: [`./primeros-pasos.md`](./primeros-pasos.md).
