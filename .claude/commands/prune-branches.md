---
description: Borra ramas locales ya mergeadas a develop, con confirmación
---

El usuario quiere limpiar ramas locales obsoletas. Flujo:

1. **Actualizar refs remotas**:
   ```bash
   git fetch --prune origin
   ```

2. **Rama actual** (no se puede borrar):
   ```bash
   CURRENT=$(git rev-parse --abbrev-ref HEAD)
   ```

3. **Listar ramas locales mergeadas a `origin/develop`**, excluyendo protegidas y la actual:
   ```bash
   git branch --merged origin/develop \
     | sed 's/^[* ]*//' \
     | grep -vE "^(main|develop|master)$" \
     | grep -v "^${CURRENT}$"
   ```

4. Si la lista está **vacía** → avisá al usuario ("no hay ramas locales mergeadas para borrar") y terminá.

5. Si hay 1-4 ramas → usá `AskUserQuestion` con `multiSelect: true` para que el usuario elija cuáles borrar.
   Si hay más de 4 → mostrá la lista completa y pedí confirmación global ("borrar las N?") o que indique un subset.

6. Para cada rama confirmada:
   ```bash
   git branch -d <rama>
   ```
   **Nunca** uses `-D` (force). Si una rama falla con "not fully merged", avisá al usuario — esa rama quizás no está realmente mergeada y requiere inspección.

7. Reportá: cuántas borradas, cuáles quedaron (si alguna falló).

**Reglas**:
- Nunca borrás `main`, `develop`, `master` ni la rama actual.
- Nunca tocás remotas.
- No uses `git branch -D`.
