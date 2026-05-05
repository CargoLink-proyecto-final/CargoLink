---
description: Muestra estado, CI, reviews y comentarios del PR de la rama actual
---

El usuario quiere ver el estado del PR de la rama actual. Flujo:

1. **Chequear `gh` disponible y autenticado**:
   ```bash
   command -v gh >/dev/null || { echo "gh no instalado — brew install gh"; exit 1; }
   gh auth status >/dev/null 2>&1 || { echo "gh sin auth — gh auth login"; exit 1; }
   ```

2. **Datos del PR**:
   ```bash
   gh pr view --json number,state,title,url,mergeable,mergeStateStatus,reviewDecision,isDraft
   ```
   Si devuelve error "no pull requests found for branch" → avisá al usuario y sugerí `/pr` para abrirlo. Terminá.

3. **CI checks**:
   ```bash
   gh pr checks
   ```

4. **Últimos comentarios** (los 3 más recientes):
   ```bash
   gh pr view --json comments --jq '.comments | sort_by(.createdAt) | reverse | .[0:3]'
   ```

5. **Render compacto** al usuario:
   ```
   PR #<number>: <title>  [<state>] <url>

   Mergeable: <mergeable>   Review: <reviewDecision>   Draft: <isDraft>

   CI:
     ✓ <passing>
     ✗ <failing>
     … <pending>

   Últimos comentarios:
   - [<author>, <date>]: <snippet>
   ```

6. Si hay checks **failing** o review **CHANGES_REQUESTED**, resaltalo.
