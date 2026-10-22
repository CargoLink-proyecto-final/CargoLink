#!/usr/bin/env bash
# Prueba el hook de pre-commit contra las formas de invocación que importan.
#
#   bash .claude/hooks/tests/pre-commit-validate.probe.sh [ruta-al-hook]
#
# Se arma sus propios repos descartables en un temporal —uno parado en una
# feature branch y otro en `develop`— así no depende de cómo tenga el disco
# quien lo corra, y no puede dar un falso verde porque el "checkout protegido"
# resultó estar en otra rama.
#
# Qué se está probando: el hook corre ANTES del comando, en el cwd de la sesión,
# así que tiene que deducir del propio comando dónde va a aterrizar cada commit.
# Los casos compuestos son los que importan — una versión anterior se quedaba
# con el último `-C` o `cd` del comando entero y dejaba pasar un commit a
# `develop`.
set -u

HOOK="${1:-$(dirname "$0")/../pre-commit-validate.sh}"
HOOK_ABS="$(cd "$(dirname "$HOOK")" && pwd)/$(basename "$HOOK")"
FAILED=0

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Dos repos mínimos: uno en una feature branch, otro en develop.
make_repo() {
  local dir="$1" branch="$2"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email probe@example.com
  git -C "$dir" config user.name probe
  git -C "$dir" commit -q --allow-empty -m "chore: init"
  git -C "$dir" checkout -q -b "$branch"
}

WT="$TMP/feature"
MAIN="$TMP/protegido"
make_repo "$WT" "feat/algo"
make_repo "$MAIN" "develop"

# probe_in <cwd> <descripción> <comando> <exit esperado>
probe_in() {
  local cwd="$1" desc="$2" cmd="$3" want="$4"
  local json code
  json=$(/usr/bin/python3 -c 'import json,sys; print(json.dumps({"tool_input":{"command":sys.argv[1]}}))' "$cmd")
  (cd "$cwd" && printf '%s' "$json" | CLAUDE_PROJECT_DIR="$MAIN" bash "$HOOK_ABS" >/dev/null 2>&1)
  code=$?
  if [ "$code" = "$want" ]; then
    printf '  ✓ %-56s exit=%s\n' "$desc" "$code"
  else
    printf '  ✗ %-56s exit=%s (esperaba %s)\n' "$desc" "$code" "$want"
    FAILED=1
  fi
}

# Por defecto, sesión parada en el repo con feature branch.
probe() { probe_in "$WT" "$1" "$2" "$3"; }

echo "rama feature — permite (0)"
probe "commit directo"              "git commit -m 'feat(x): add a thing'" 0
probe "cd al worktree"              "cd $WT && git commit -m 'feat(x): add a thing'" 0
probe "git -C al worktree"          "git -C $WT commit -m 'feat(x): add a thing'" 0

echo
echo "rama protegida — bloquea (2)"
probe "cd al checkout protegido"    "cd $MAIN && git commit -m 'feat(x): add a thing'" 2
probe "git -C al checkout"          "git -C $MAIN commit -m 'feat(x): add a thing'" 2

echo
echo "sesión en develop — el -C de OTRO git no decide por el commit (2)"
probe_in "$MAIN" "git -C wt log, luego commit pelado" "git -C $WT log --oneline && git commit -m 'feat(x): y'" 2
probe_in "$MAIN" "commit pelado y nada más"           "git commit -m 'feat(x): y'" 2

echo
echo "compuestos — gana la invocación que realmente commitea (2)"
probe "commit protegido, luego wt"  "git -C $MAIN commit -m 'feat(x): y' && git -C $WT commit -m 'feat(x): y'" 2
probe "cd wt, cd protegido, commit" "cd $WT && cd $MAIN && git commit -m 'feat(x): y'" 2

echo
echo "compuestos — no sobre-bloquear lo legítimo (0)"
probe "dos commits en el worktree"  "git -C $WT commit -m 'feat(x): y' && git -C $WT commit -m 'feat(x): z'" 0
probe "cd protegido para leer, -C"  "cd $MAIN && git -C $WT commit -m 'feat(x): y'" 0

echo
echo "validación del mensaje — bloquea (2)"
probe "sin conventional commits"    "git commit -m 'arreglo varias cosas'" 2

echo
echo "no es un commit — permite (0)"
probe "git log con 'commit' adentro" "git log --oneline | head -3" 0
probe "git status"                   "git status --short" 0

echo
[ "$FAILED" = 0 ] && echo "todo OK" || echo "HAY FALLAS"
exit "$FAILED"
