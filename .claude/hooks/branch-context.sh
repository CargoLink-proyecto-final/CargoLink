#!/usr/bin/env bash
# UserPromptSubmit hook: inyecta contexto de git en cada turno.
# Imprime texto plano a stdout — Claude Code lo agrega como additional context.
# Diseño: nunca falla. Si algo sale mal, no imprime nada y sale 0.
set +e

REPO="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$REPO" 2>/dev/null || exit 0

# No es git repo → nada que inyectar.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
[ -z "$BRANCH" ] && exit 0

PROTECTED=0
case "$BRANCH" in
  main|develop|master) PROTECTED=1 ;;
esac

# Ahead/behind vs origin/<branch>
UPSTREAM_INFO=""
if git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
  AHEAD=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null)
  BEHIND=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null)
  UPSTREAM_INFO="ahead ${AHEAD:-0}, behind ${BEHIND:-0} vs origin/$BRANCH"
fi

# Ahead/behind vs origin/develop (solo si no estamos en develop o main)
DEVELOP_INFO=""
if [ "$BRANCH" != "develop" ] && [ "$BRANCH" != "main" ] && git rev-parse --verify origin/develop >/dev/null 2>&1; then
  A=$(git rev-list --count "origin/develop..HEAD" 2>/dev/null)
  B=$(git rev-list --count "HEAD..origin/develop" 2>/dev/null)
  DEVELOP_INFO="ahead ${A:-0}, behind ${B:-0} vs origin/develop"
fi

STATUS_SHORT="$(git status --short 2>/dev/null | head -20)"
WORKING_TREE_CLEAN=1
[ -n "$STATUS_SHORT" ] && WORKING_TREE_CLEAN=0

# Feature branches no mergeadas a develop (locales + remotas, excluye main/develop).
# Incluye subject del último commit para que Claude pueda matchear por scope.
UNMERGED_LOCAL=""
UNMERGED_REMOTE=""
if git rev-parse --verify origin/develop >/dev/null 2>&1; then
  UNMERGED_LOCAL="$(git for-each-ref --no-merged=origin/develop \
    --sort=-committerdate \
    --format='%(refname:short)|%(committerdate:relative)|%(contents:subject)' refs/heads/ 2>/dev/null \
    | grep -vE '^(main|develop|master)\|' | head -10)"
  UNMERGED_REMOTE="$(git for-each-ref --no-merged=origin/develop \
    --sort=-committerdate \
    --format='%(refname:short)|%(committerdate:relative)|%(contents:subject)' refs/remotes/origin/ 2>/dev/null \
    | grep -vE '^origin/(main|develop|master|HEAD)\|' | head -10)"
fi

# Age del último fetch (mtime de FETCH_HEAD).
FETCH_AGE_NOTE=""
FETCH_HEAD_FILE="$(git rev-parse --git-path FETCH_HEAD 2>/dev/null)"
if [ -f "$FETCH_HEAD_FILE" ]; then
  NOW=$(date +%s)
  MTIME=$(stat -f %m "$FETCH_HEAD_FILE" 2>/dev/null || stat -c %Y "$FETCH_HEAD_FILE" 2>/dev/null)
  if [ -n "$MTIME" ]; then
    AGE=$(( NOW - MTIME ))
    if [ "$AGE" -gt 3600 ]; then
      MINUTES=$(( AGE / 60 ))
      FETCH_AGE_NOTE="último fetch hace ${MINUTES} min — considerá \`git fetch origin\`"
    fi
  fi
else
  FETCH_AGE_NOTE="nunca se hizo \`git fetch\` en este clone — ejecutá \`git fetch origin\` antes de crear ramas"
fi

# --- Render ---
printf '## Git branch context (auto-injected)\n\n'
printf '**Rama actual:** `%s`' "$BRANCH"
if [ "$PROTECTED" -eq 1 ]; then
  printf ' ⚠️ **PROTEGIDA — no editar código ni commitear acá. Crear/retomar feature branch primero (ver CLAUDE.md).**'
fi
printf '\n'

[ -n "$UPSTREAM_INFO" ] && printf '**Upstream:** %s\n' "$UPSTREAM_INFO"
[ -n "$DEVELOP_INFO" ] && printf '**vs develop:** %s\n' "$DEVELOP_INFO"

if [ "$WORKING_TREE_CLEAN" -eq 1 ]; then
  printf '**Working tree:** limpio\n'
else
  printf '**Working tree:** con cambios:\n```\n%s\n```\n' "$STATUS_SHORT"
fi

if [ -n "$UNMERGED_LOCAL" ] || [ -n "$UNMERGED_REMOTE" ]; then
  printf '\n**Feature branches no mergeadas a develop** (retomables):\n'
  if [ -n "$UNMERGED_LOCAL" ]; then
    printf '\n_Locales:_\n'
    printf '%s\n' "$UNMERGED_LOCAL" | awk -F'|' '{printf "- `%s` (%s) — %s\n", $1, $2, $3}'
  fi
  if [ -n "$UNMERGED_REMOTE" ]; then
    printf '\n_Remotas (origin):_\n'
    printf '%s\n' "$UNMERGED_REMOTE" | awk -F'|' '{printf "- `%s` (%s) — %s\n", $1, $2, $3}'
  fi
fi

[ -n "$FETCH_AGE_NOTE" ] && printf '\n_Note:_ %s\n' "$FETCH_AGE_NOTE"

exit 0
