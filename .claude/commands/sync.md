---
description: Trae últimos cambios de origin/develop a la feature branch actual (fast-forward)
---

El usuario quiere sincronizar la feature branch con `develop`. Seguí este flujo:

1. **Chequeos previos**:
   - Rama actual: si es `main`, `develop` o `master`, **parate** y explicale que `/sync` es para feature branches. Para actualizar `develop` o `main`, un `git pull --ff-only` directo basta.
   - Working tree: debe estar limpio. Si no, pedile al usuario que commitee o stashee antes.

2. **Fetch y merge fast-forward**:
   ```bash
   git fetch origin
   git merge --ff-only origin/develop
   ```

3. **Si `--ff-only` falla** (historia divergente):
   - **No** ejecutes `git rebase` ni `git merge` no-FF sin confirmación.
   - Mostrale al usuario qué pasa (`git log --oneline --graph HEAD origin/develop | head -20`).
   - Ofrecé dos caminos y que elija:
     - `git rebase origin/develop` (reescribe historia de la feature — OK si no se pushó o si estás solo en la rama).
     - `git merge origin/develop` (crea merge commit — más seguro si otros colaboran).

4. Reportá el resultado: cuántos commits trajo, último commit tras el sync.
