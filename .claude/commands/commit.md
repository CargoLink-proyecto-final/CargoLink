---
description: Arma un commit con mensaje conventional correcto a partir del diff staged
---

El usuario quiere commitear. Seguí este flujo exacto — no lo abrevies:

1. **Rama actual**:
   - `git rev-parse --abbrev-ref HEAD`
   - Si es `main`, `develop` o `master` → **parate**. No se commitea en protegidas. Recomendá `/branch-new` o `/branch-switch` y terminá acá.

2. **Working tree**:
   - `git status --short` y `git diff --cached --stat`.
   - **Si no hay staged changes** pero hay modificaciones → preguntale al usuario qué stagear (no hagas `git add -A` sin confirmar; evitá incluir archivos sensibles como `.env`, credentials, backups grandes, logs).
   - **Si no hay cambios en absoluto** → avisá y terminá.

3. **Inspeccioná el diff staged** para armar el mensaje:
   - `git diff --cached` (y `--stat` para overview).
   - Identificá:
     - **type**: `fix` si arregla bug, `feat` si agrega funcionalidad, `refactor` si reorganiza sin cambiar comportamiento, `chore` si es housekeeping/config/deps, `docs`, `test`, `style` (formato), `perf`, `ci`, `build`.
     - **scope** (opcional pero preferido): el módulo/componente tocado. Inferí de las rutas modificadas (ej: archivos en `backend/src/loads/` → `scope: loads`; archivos en `backend/src/trips/` → `scope: trips`; archivos en `frontend/app/dashboard/` → `scope: dashboard`). Kebab-case, minúsculas.
     - **description**: en **inglés**, minúsculas, imperativo, sin punto final, 1 línea idealmente ≤72 chars.
   - Si el diff es grande o hetero, considerá sugerir **dividir en varios commits** en vez de uno grande.

4. **Formato final obligatorio**:
   ```
   type(scope): description
   ```
   Sin scope si es cambio global: `type: description`.
   Body opcional (líneas vacías + párrafos) solo si el cambio lo amerita.

5. **Confirmá el mensaje con el usuario** antes de commitear. Mostralo en un code block. Si el usuario pide ajustes, iterá.

6. **Commiteá**:
   ```bash
   git commit -m "$(cat <<'EOF'
   <mensaje final>
   EOF
   )"
   ```
   - **Nunca** uses `--no-verify` ni `--no-gpg-sign` a menos que el usuario lo pida explícitamente.
   - Si el hook `PreToolUse` bloquea el commit (rama protegida o mensaje inválido), leé el mensaje del hook, corregí y reintentá.
   - **Nunca** uses `--amend` sobre commits ya pusheados, salvo pedido explícito del usuario.

7. **Reportá** el sha corto y el subject del commit creado. Si es el primer commit de una feature branch, recordale al usuario que puede abrir PR con `/pr`.
