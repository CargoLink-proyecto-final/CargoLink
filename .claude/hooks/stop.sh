#!/usr/bin/env bash
# Stop hook: al terminar el turno, recuerda cambios sin commitear.
# Diseño: no bloquea nunca, solo informa.
set +e

REPO="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$REPO" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

STATUS=$(git status --short 2>/dev/null | head -20)
if [ -n "$STATUS" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  cat <<EOF
💾 Cambios sin commitear en \`$BRANCH\`:
$STATUS

Si querés commitearlos, pedí \`/commit\` en tu próximo turno.
EOF
fi
exit 0
