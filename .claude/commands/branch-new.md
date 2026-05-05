---
description: Crea una feature branch nueva desde develop actualizado, preguntando si aislar en worktree
argument-hint: [descripción opcional — si falta, inferí del contexto]
---

El usuario quiere empezar una feature nueva. Seguí este flujo:

## 1. Working tree limpio

```bash
git status --short
```

Si hay cambios sin commitear, **parate** y avisale al usuario. No pises trabajo — si realmente hay que arrancar una feature ya, que commitee/stashee primero.

## 2. Actualizar develop

```bash
git fetch origin
```

## 3. Inferir `type` y `slug`

- `type` ∈ `{feat, fix, chore, refactor, docs, test}`.
- Si `$ARGUMENTS` tiene texto → inferí `type` y slug desde ahí:
  - `"arreglar offset del dropdown"` → `fix/dropdown-offset`
  - `"agregar reporte de rendimientos"` → `feat/reporte-rendimientos`
- Si `$ARGUMENTS` está vacío → inferí del último mensaje del usuario. Si no hay señal clara, **preguntale** con `AskUserQuestion`.
- Confirmá el nombre propuesto antes de crear nada.

## 4. Preguntar si usar worktree

Antes de crear la rama, preguntale al usuario con `AskUserQuestion`:

> ¿Dónde crear la rama `<type>/<slug>`?

Opciones:
- **Rama regular** (en el repo principal) — más simple, funciona bien si trabajás solo. Hace `git checkout -b <type>/<slug>` desde `develop`.
- **Worktree aislado** — directorio hermano del repo (`../Plataforma-<slug>`) con su propia rama. Recomendado si ya hay otra sesión Claude activa en el mismo sistema (ver hook `SessionStart`). Te permite trabajar en paralelo sin pisarte.

**Recomendación por default**:
- Si el hook `SessionStart` detectó otras sesiones (via lockfile en `/tmp/claude-sessions/`), recomendá **worktree**.
- Sino, recomendá **rama regular**.

En la `AskUserQuestion`, poné la recomendación con `(Recomendado)` en el label de la opción apropiada según el contexto detectado.

## 5a. Si eligió rama regular

```bash
git checkout develop
git pull --ff-only origin develop
git checkout -b <type>/<slug>
```

Reportá:
```
✓ Rama `<type>/<slug>` creada desde develop@<sha corto>.
  Lista para trabajar.
```

## 5b. Si eligió worktree

Seguí el flujo de `/worktree-new <slug>` internamente:

```bash
REPO=$(git rev-parse --show-toplevel)
NAME=$(basename "$REPO")
WT="$(dirname "$REPO")/${NAME}-<slug>"

git worktree add "$WT" -b "<type>/<slug>" origin/develop

# Copiar .env si existen (gitignored, no se propagan con el checkout).
[ -f "$REPO/docker/.env.dev" ] && cp "$REPO/docker/.env.dev" "$WT/docker/.env.dev"
[ -f "$REPO/docker/.env.prod" ] && cp "$REPO/docker/.env.prod" "$WT/docker/.env.prod"
```

Reportá:
```
✓ Worktree creado en <WT>
✓ Rama `<type>/<slug>` desde origin/develop
✓ Copié docker/.env.dev (si existía)

Para abrir otra sesión Claude en el worktree:
  cd <WT> && claude

Advertencia: DB Docker y stack compose son compartidos entre worktrees.
No corrás migraciones ni levantes stack simultáneo desde dos worktrees
(ver CLAUDE.md § Worktrees).
```

**No** hagas `cd` ni lances Claude vos — los hooks no pueden redirigir la sesión actual; el usuario abre la segunda.

## 6. Si algo falla

Pará y mostrale el error al usuario antes de seguir. Errores típicos:
- `pull --ff-only` falla por divergencia → `git fetch` + ver estado.
- `git worktree add` falla porque el path ya existe → usar otro slug o limpiarlo.
- Conflictos de checkout porque el working tree tenía cambios (el paso 1 debería haberlo bloqueado, pero a veces el user dice "seguí igual").
