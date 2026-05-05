#!/usr/bin/env bash
# SessionStart hook: detecta si hay otras sesiones Claude Code activas
# en el mismo sistema y sugiere /worktree-new. Silencioso en worktrees
# secundarios (ya están aislados).
# Diseño: nunca bloquea — exit 0 siempre.
set +e

REPO="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$REPO" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# --- B: si soy worktree secundario, salir sin avisar ---
# El primer `worktree` en `git worktree list --porcelain` es el principal.
MAIN_WT=$(git worktree list --porcelain 2>/dev/null | awk 'NR==1 && /^worktree / {print $2}')
if [ -n "$MAIN_WT" ] && [ "$REPO" != "$MAIN_WT" ]; then
  exit 0
fi

# --- C: registrar lockfile y contar sesiones vivas ---
LOCKDIR="/tmp/claude-sessions"
mkdir -p "$LOCKDIR" 2>/dev/null || exit 0

# Subir por la cadena de parents hasta encontrar un proceso `claude`.
find_claude_pid() {
  local pid=$PPID
  local i=0
  while [ "$pid" != "1" ] && [ -n "$pid" ] && [ "$i" -lt 10 ]; do
    local comm
    comm=$(ps -o comm= -p "$pid" 2>/dev/null | awk -F/ '{print $NF}' | tr -d ' ')
    if [ "$comm" = "claude" ]; then
      echo "$pid"; return 0
    fi
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    i=$((i+1))
  done
  echo "$PPID"
}
CLAUDE_PID=$(find_claude_pid)

# Hash del cwd: distingue clones/worktrees distintos.
CWD_HASH=$(printf '%s' "$REPO" | shasum -a 256 2>/dev/null | cut -c1-12)
[ -z "$CWD_HASH" ] && CWD_HASH="unknown"

# Escribir nuestro lockfile.
LOCK="$LOCKDIR/session-${CWD_HASH}-${CLAUDE_PID}"
echo "$CLAUDE_PID" > "$LOCK" 2>/dev/null

# Limpieza lazy: borrar lockfiles cuyo PID ya no vive.
for f in "$LOCKDIR"/session-*; do
  [ -f "$f" ] || continue
  pid=$(cat "$f" 2>/dev/null)
  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$f"
  fi
done

# Contar sesiones vivas (locks que sobrevivieron al cleanup).
ACTIVE=$(ls "$LOCKDIR"/session-* 2>/dev/null | wc -l | tr -d ' ')
[ -z "$ACTIVE" ] && ACTIVE=0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$ACTIVE" -gt 1 ]; then
  OTHERS=$((ACTIVE - 1))
  cat <<EOF
⚠️  Hay $OTHERS otra(s) sesión(es) Claude Code activa(s).

Estás en rama \`$BRANCH\` (repo principal). Si vas a trabajar en una
feature distinta, considerá un worktree aislado:

  /worktree-new <slug>

Ver CLAUDE.md § Worktrees para advertencias sobre recursos compartidos.
EOF
fi
exit 0
