---
description: Crea un git worktree con una feature branch nueva desde develop
argument-hint: [slug opcional — si falta, inferí del contexto]
---

El usuario quiere crear un worktree aislado para trabajar en otra feature en paralelo (sin cambiar de rama en el repo principal). Flujo:

1. **Working tree limpio**:
   - `git status --short`. Si hay cambios, pedí commit/stash primero. No creés worktree sobre trabajo pendiente porque `git worktree add` usa el índice del repo principal.

2. **Actualizar refs**:
   ```bash
   git fetch origin
   ```

3. **Inferir `type` y `slug`**:
   - Si `$ARGUMENTS` tiene algo, usalo como slug (y preguntá/inferí `type`).
   - Si `$ARGUMENTS` está vacío, inferí del último mensaje del usuario. Si no hay señal clara → preguntá con `AskUserQuestion`.
   - Convertí a kebab-case si hace falta.

4. **Armar path del worktree**:
   ```bash
   REPO=$(git rev-parse --show-toplevel)
   NAME=$(basename "$REPO")
   WT="$(dirname "$REPO")/${NAME}-<slug>"
   ```

5. **Crear worktree + rama** desde `origin/develop`:
   ```bash
   git worktree add "$WT" -b "<type>/<slug>" origin/develop
   ```

6. **Copiar `.env` del repo principal** si existe (es gitignored; no se propaga solo):
   ```bash
   [ -f "$REPO/.env" ] && cp "$REPO/.env" "$WT/.env"
   ```
   Si no hay `.env` en el repo principal, no avises — no es un error.

7. **Reportá al usuario**:
   ```
   ✓ Worktree creado en <WT>
   ✓ Rama: <type>/<slug> (desde origin/develop)
   ✓ Copié .env (si existía)

   Para abrir otra sesión Claude en el worktree:
     cd <WT> && claude

   Advertencia: la DB Docker (container `postgres`) y el stack compose son
   compartidos. No corrás `prisma migrate` ni levantes el stack
   simultáneamente desde dos worktrees (ver CLAUDE.md sección Worktrees).
   ```

**No** hagas `cd` ni lances Claude vos. Los hooks no pueden redirigir la sesión actual; el usuario abre la segunda.

9. **Dependencias (opcional)** — si el worktree va a usarse para correr frontend/backend local **sin** Docker, ofrecé instalaciones antes de salir:
   - Si existe `<WT>/frontend/package.json` → preguntar con `AskUserQuestion` "¿correr `npm install` en el frontend del worktree?". Si acepta, `cd <WT>/frontend && npm install`.
   - Para backend, el flujo normal es vía Docker (no venv local), así que no propongás `pip install` salvo que el usuario mencione explícitamente dev local sin Docker.

   **Nunca** corras instalaciones sin confirmación explícita. Si el usuario trabaja solo con Docker, el stack del repo principal sigue sirviendo — no hace falta reinstalar nada.
