---
description: Mergea PR a develop, borra rama remota y local, y ofrece limpiar el worktree asociado
argument-hint: [numero-de-PR — opcional si hay uno solo de la rama actual]
---

El usuario quiere mergear un PR a `develop`. Seguí este flujo de forma estricta, **sin atajos**.

## Reglas fundamentales

- Este comando **solo mergea a `develop`**. Si el PR apunta a `main` → PARATE y avisá: "ese merge lo hace el mantenedor humano manualmente, no Claude". El hook `PreToolUse` además bloquea duro `gh pr merge` sobre PRs a main — aunque intentes bypassearlo, te rechaza.
- El usuario **tiene que confirmar** antes de que mergees. Nunca mergees sin `AskUserQuestion` explícita.
- Método de merge: **siempre `--merge` (merge commit)**, nunca squash ni rebase. Es la política del repo.
- Delete branch: **siempre `--delete-branch`**. No dejar basura en `origin`.

## Flujo

### 1. Determinar qué PR mergear

- Si `$ARGUMENTS` tiene un número → ese es el PR.
- Si `$ARGUMENTS` está vacío → `gh pr view --json number,state,baseRefName,title` para el PR asociado a la rama actual. Si no hay uno, paro y avisá al user.

### 2. Verificar que apunta a develop

```bash
gh pr view <N> --json baseRefName,state,mergeable,mergeStateStatus
```

- Si `state ≠ OPEN` → avisá y termino.
- Si `baseRefName ≠ develop` → **parate**, explicale al user que este comando solo es para PRs a develop.
- Si `mergeable = CONFLICTING` → avisá, no mergees.
- Si `mergeStateStatus` ∈ `{BLOCKED, BEHIND, DIRTY}` → avisá qué está bloqueando y paro.
- Si `mergeStateStatus = UNKNOWN` → esperá 5 segundos y re-chequeá una vez.

### 3. Chequear CI si hay checks

```bash
gh pr checks <N>
```

Si hay checks failing, **no mergees**. Avisá al user y pará. Si están pending, preguntale al user si quiere esperar o forzar (por default, esperar).

### 4. Pedir aprobación explícita del user

Usar `AskUserQuestion` con el contexto del PR:
- Título del PR.
- Base: `develop`.
- Number of commits.
- Status de CI (passed/failed/pending).

Opciones:
- **Sí, mergear** (recomendado si está todo verde).
- **No, cancelar**.

Si el user elige cancelar → paro. No hago nada más.

### 5. Mergear

```bash
gh pr merge <N> --merge --delete-branch
```

**Sin excepciones** en los flags: siempre merge commit, siempre delete branch remota.

Sobre el `gh pr review --approve` formal: **no lo hago** — el PR lo abrió Claude con el token del user, que es el autor, y GitHub rechaza self-approve. Es un upgrade path cuando haya bot/reviewer distinto.

### 6. Sync local + cleanup de rama local

```bash
git fetch --prune origin
# Si estás en develop local, actualizalo.
CURRENT=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT" = "develop" ]; then
  git pull --ff-only origin develop
fi
# Borrar la rama local que correspondía al PR (si existe).
# La rama del head del PR se puede sacar del output del paso 2.
HEAD_BRANCH=<extraído de gh pr view>
if git show-ref --verify --quiet "refs/heads/$HEAD_BRANCH"; then
  git branch -d "$HEAD_BRANCH" 2>/dev/null || {
    # Si `-d` falla porque git no "ve" la rama como mergeada (por ser merge commit),
    # avisar al user y pedir confirmación explícita para usar -D.
    echo "Advertencia: $HEAD_BRANCH no aparece como mergeada localmente (común con merge commits). ¿Usar -D?"
    # Con AskUserQuestion.
  }
fi
```

### 6.5. Cleanup de worktree asociado (si existe)

Si la rama mergeada tiene un git worktree **secundario** (no el worktree desde donde corre `/merge-pr`), ofrecé borrarlo. `gh pr merge --delete-branch` no toca worktrees, y dejarlos vivos genera huérfanos que apuntan a ramas inexistentes.

```bash
# Detectar worktree asociado a la rama mergeada, excluyendo el worktree
# desde donde corre /merge-pr (típicamente el principal — no lo borramos).
CURRENT_WT="$(git rev-parse --show-toplevel)"
WORKTREE_PATH="$(git worktree list --porcelain | awk \
  -v branch="refs/heads/$HEAD_BRANCH" -v current="$CURRENT_WT" '
  # path puede tener espacios → tomar todo después de "worktree "
  /^worktree / { wt = substr($0, length($1) + 2) }
  $0 == "branch " branch && wt != current { print wt; exit }
')"
```

Si `WORKTREE_PATH` está vacío → saltar al paso 7. Esto cubre los casos:
- Rama sin worktree secundario (la mergeada vivía solo en el worktree desde donde corrés — el principal no se toca, fin).
- Rama en un worktree secundario, pero corriste `/merge-pr` desde ese mismo worktree (filtro lo skipea por seguridad — pediríamos borrar el suelo donde estás parado).

Si hay worktree secundario detectado:

1. **Doble-check de seguridad** (por si el filtro de arriba falla con un edge case raro):
   ```bash
   case "$(pwd -P)" in
     "$WORKTREE_PATH"|"$WORKTREE_PATH"/*) IN_WT=1 ;;
     *) IN_WT=0 ;;
   esac
   ```
   Si `IN_WT=1`, avisá al user que cambie a otro worktree (el principal sirve) y retome `/merge-pr` desde ahí. **No hagas `cd` automático.**

2. **Chequear el estado del worktree**:
   ```bash
   STATUS="$(git -C "$WORKTREE_PATH" status --short 2>/dev/null)"
   ```
   - Si vacío → worktree limpio.
   - Si no vacío → hay cambios sin commitear o untracked. Guardalo para mostrarle al user antes de pedirle confirmación.

3. **Aviso operacional sobre Docker**: `worktree remove` borra el directorio pero **no para containers**. Si el user había levantado el stack docker desde ese path, mostrá un warning recomendando `docker compose down` desde ese worktree. No lo ejecutes vos — solo avisá.

4. **Pedir confirmación con `AskUserQuestion`**:
   - Header: `Worktree`
   - Pregunta: `¿Borrar worktree <path-relativo>?`
   - Opciones según estado:
     - Si **limpio**: "Borrar worktree (Recomendado)" / "Dejarlo".
     - Si **sucio**: "Cancelar (lo limpio yo)" (Recomendado) / "Borrar forzado (pierdo los cambios sucios)" / "Dejarlo".
   - Mostrá el output de `STATUS` en la description si hay cambios.

5. **Ejecutar según la respuesta**:
   ```bash
   git worktree remove "$WORKTREE_PATH"            # worktree limpio
   git worktree remove --force "$WORKTREE_PATH"    # solo si el user confirmó forzado
   ```

6. Anotá el resultado para incluirlo en el reporte del paso 7.

### 7. Reportar resultado al user

Formato:
```
✓ PR #<N> mergeado a develop con merge commit <sha>.
✓ Rama remota `<rama>` borrada.
✓ Rama local `<rama>` borrada.
✓ Worktree `<path>` borrado.            ← solo si se borró efectivamente en 6.5

URL del merge commit: <url>
```

Si el worktree se detectó pero NO se borró (user eligió "Dejarlo", o estabas parado adentro), agregá una línea informativa al final:
```
ℹ Worktree `<path>` sigue vivo. Para borrarlo:
    git worktree remove <path>           # si está limpio
    git worktree remove --force <path>   # si tiene cambios sin commitear
```

### 8. Ofrecer siguiente paso — PR a main?

Preguntá con `AskUserQuestion`:
- ¿Abrir PR de `develop → main` ahora con `/release`?

Si el user dice sí → invocá `/release`. Si dice no → terminá.

## Qué NO hacés en este comando

- Mergear a `main` (bloqueado por hook + esta guía).
- Aprobar formalmente vía `gh pr review --approve` (falla por self-authorship; upgrade path futuro).
- Usar squash o rebase como método de merge.
- Omitir `--delete-branch`.
- Saltarte el paso de confirmación del user.
- Continuar si el CI está failing sin confirmación explícita.
- Borrar el worktree asociado sin pasar por el `AskUserQuestion` del paso 6.5 (riesgo de perder untracked / dejar containers docker huérfanos).
- Hacer `cd` para meterte vos en otro worktree y borrarlo desde ahí — si estás parado adentro, avisás y dejás que el user reubique la sesión.
