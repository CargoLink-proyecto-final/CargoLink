#!/usr/bin/env bash
# PreToolUse hook (matcher=Bash). Valida tres cosas:
#   1. `git commit`: rama no protegida + mensaje conventional.
#   2. `gh pr merge <N>` contra PR con baseRefName=main → bloquear.
#   3. `gh pr review <N> --approve` contra PR con baseRefName=main → bloquear.
#
# Entrada: JSON por stdin con tool_input.command.
# Salidas:
#   exit 0 → permitir.
#   exit 2 → bloquear; stderr se muestra a Claude para que corrija.
#
# Diseño: si el hook tiene un bug, NO bloquea — exit 0.
set +e

REPO="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Lee el JSON del stdin completo.
INPUT="$(cat)"

# Extrae el comando bash usando python3 (viene en macOS). Si falla → no bloquear.
CMD="$(printf '%s' "$INPUT" | /usr/bin/python3 -c '
import json, sys
try:
  d = json.load(sys.stdin)
  print(d.get("tool_input", {}).get("command", ""))
except Exception:
  pass
' 2>/dev/null)"

# Si no hay comando, dejar pasar.
[ -z "$CMD" ] && exit 0

# ────────────────────────────────────────────────────────────────────────
# Bloque A: bloqueo de operaciones contra PRs que apuntan a main.
# ────────────────────────────────────────────────────────────────────────

# Detectar si el command es `gh pr merge` o `gh pr review ... --approve`.
IS_PR_MERGE=0
IS_PR_APPROVE=0
case "$CMD" in
  *"gh pr merge"*) IS_PR_MERGE=1 ;;
esac
case "$CMD" in
  *"gh pr review"*"--approve"*) IS_PR_APPROVE=1 ;;
  *"gh pr review"*"-a "*) IS_PR_APPROVE=1 ;;
esac

if [ "$IS_PR_MERGE" -eq 1 ] || [ "$IS_PR_APPROVE" -eq 1 ]; then
  # Extraer el número de PR del comando (primer argumento posicional después de merge/review).
  PR_NUM="$(printf '%s' "$CMD" | /usr/bin/python3 -c '
import sys, shlex, re
try:
  tokens = shlex.split(sys.stdin.read())
except Exception:
  sys.exit(0)
# Buscar el índice de "merge" o "review" después de "pr".
pr_pos = -1
for i, t in enumerate(tokens):
  if t == "pr" and i + 1 < len(tokens) and tokens[i+1] in ("merge", "review"):
    pr_pos = i + 1
    break
if pr_pos < 0:
  sys.exit(0)
# El siguiente argumento que sea un entero es el PR num.
for t in tokens[pr_pos+1:]:
  if re.match(r"^[0-9]+$", t):
    print(t); break
' 2>/dev/null)"

  if [ -n "$PR_NUM" ]; then
    # Consultar la base del PR vía gh. Si gh no está, no bloquear (fallback seguro).
    BASE="$(cd "$REPO" 2>/dev/null && gh pr view "$PR_NUM" --json baseRefName --jq '.baseRefName' 2>/dev/null)"

    if [ "$BASE" = "main" ] || [ "$BASE" = "master" ]; then
      if [ "$IS_PR_MERGE" -eq 1 ]; then
        cat >&2 <<EOF
🚫 Bloqueado: PR #$PR_NUM apunta a \`$BASE\`. Claude no mergea PRs a main/master.

Los PRs a \`main\` son operaciones de release y se mergean manualmente desde
GitHub por el mantenedor humano. Claude solo abre el PR con \`/release\` y
entrega la URL.

Si este PR apunta a main por error, usá \`gh pr edit $PR_NUM --base develop\`
desde tu propia terminal (no desde Claude) para corregirlo.
EOF
      else
        cat >&2 <<EOF
🚫 Bloqueado: PR #$PR_NUM apunta a \`$BASE\`. Claude no aprueba PRs a main/master.

La aprobación de un PR a \`main\` es decisión del mantenedor humano como parte
del proceso de release. Este paso queda fuera del alcance de Claude Code.
EOF
      fi
      exit 2
    fi
  fi
  # Si no pudimos determinar la base, dejar pasar (la otra barrera es
  # que /release no invoca estos comandos — y si alguien los invoca a mano,
  # allá él).
  exit 0
fi

# ────────────────────────────────────────────────────────────────────────
# Bloque B: validación de git commit.
# ────────────────────────────────────────────────────────────────────────

# Si no es `git commit`, dejar pasar. Detección por TOKENS (no substring): busca
# un token `git` y, salteando sus opciones globales (-C <path>, -c <k=v>,
# --git-dir, etc.), verifica que el subcomando sea exactamente `commit`. Así un
# comando read-only como `git log ... | echo "...commits..."` NO se confunde con
# un commit real — el glob viejo `*"git"*"commit"*` matcheaba ambos y bloqueaba
# comandos inocentes en ramas protegidas.
IS_GIT_COMMIT="$(printf '%s' "$CMD" | /usr/bin/python3 -c '
import sys, shlex
try:
  tokens = shlex.split(sys.stdin.read())
except Exception:
  print("0"); sys.exit(0)
GLOBAL_WITH_ARG = ("-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path")
i, n, found = 0, len(tokens), False
while i < n:
  if tokens[i] == "git":
    j = i + 1
    while j < n:
      t = tokens[j]
      if t in GLOBAL_WITH_ARG:
        j += 2; continue
      if t.startswith("-"):
        j += 1; continue
      break
    if j < n and tokens[j] == "commit":
      found = True
      break
  i += 1
print("1" if found else "0")
' 2>/dev/null)"

# Si no es un git commit real, dejar pasar.
[ "$IS_GIT_COMMIT" != "1" ] && exit 0

# Rama actual. Resolvemos desde el cwd del comando, NO desde CLAUDE_PROJECT_DIR:
# en un worktree (`/worktree-new`, `git worktree add`) el project dir sigue
# apuntando al checkout principal, que normalmente está parado en `develop`.
# Mirar ahí daba un falso positivo que bloqueaba TODO commit hecho desde
# cualquier worktree, aunque su rama fuera una feature perfectamente válida.
# Fallback a $REPO por si el hook corriera fuera de un repo git.
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
[ -z "$BRANCH" ] && BRANCH="$(cd "$REPO" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null)"
[ -z "$BRANCH" ] && exit 0

# 1. Protección de rama.
case "$BRANCH" in
  main|develop|master)
    cat >&2 <<EOF
🚫 Commit bloqueado: estás en la rama protegida \`$BRANCH\`.

Según CLAUDE.md, ninguna feature se commitea directo a \`main\`, \`develop\` ni \`master\`.

Qué hacer:
  1. Guardá los cambios actuales (por ahora quedan como working tree).
  2. Creá o retomá una feature branch (\`/branch-new\` o \`/branch-switch\`).
  3. Reintentá el commit desde la rama correcta.

Si esto es intencional (hotfix directo a main autorizado por el usuario), pedile confirmación explícita antes de bypassear.
EOF
    exit 2
    ;;
esac

# 2. Validación del mensaje (solo si hay -m en el command).
# Extrae el valor del primer -m "..." o -m '...' usando python para manejar quoting.
MSG="$(printf '%s' "$CMD" | /usr/bin/python3 -c '
import sys, shlex
try:
  tokens = shlex.split(sys.stdin.read())
except Exception:
  sys.exit(0)
msg = ""
i = 0
while i < len(tokens):
  t = tokens[i]
  if t == "-m" and i + 1 < len(tokens):
    msg = tokens[i+1]
    break
  if t.startswith("-m") and len(t) > 2:
    msg = t[2:]
    break
  if t.startswith("--message="):
    msg = t.split("=", 1)[1]
    break
  i += 1
print(msg)
' 2>/dev/null)"

# Si no hay -m (ej. commit abre editor, o --amend sin -m), no validamos formato aquí.
[ -z "$MSG" ] && exit 0

# Toma solo la primera línea del mensaje (conventional se valida en el subject).
FIRST_LINE="$(printf '%s' "$MSG" | head -n 1)"

# Regex conventional commits.
REGEX='^(feat|fix|chore|refactor|docs|test|style|perf|ci|build)(\([a-z0-9._-]+\))?!?: .+'

if ! printf '%s' "$FIRST_LINE" | grep -qE "$REGEX"; then
  cat >&2 <<EOF
🚫 Commit bloqueado: el mensaje no cumple conventional commits.

Mensaje recibido:
  $FIRST_LINE

Formato esperado:
  type(scope): description

  type ∈ {feat, fix, chore, refactor, docs, test, style, perf, ci, build}
  scope: opcional, kebab-case entre paréntesis.
  description: en inglés, minúsculas, imperativo, sin punto final.

Ejemplos válidos:
  feat(loads): add load filtering by status
  fix(trips): correct GPS coordinate rounding
  chore(docker): align compose ports with env

Reintentá con un mensaje corregido.
EOF
  exit 2
fi

exit 0
