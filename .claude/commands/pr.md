---
description: Cierra la feature con pasada de QA automática y abre PR contra develop. Nunca abre PR a main.
argument-hint: [--skip-qa para casos triviales como typos o docs puros]
---

El usuario quiere cerrar la feature. Seguí este flujo **estricto**. El QA no es opcional salvo con flag explícito.

## Reglas fundamentales

- **Base del PR: siempre `develop`. Nunca `main`.** Sin excepción. Para PR `develop → main` (release), usá `/release`.
- **QA pass obligatorio**: el subagente `qa-engineer` valida antes de abrir el PR. Si reporta BLOQUEANTES, el comando aborta y volvés al main para resolver.
- **Skip de QA**: `/pr --skip-qa` solo para casos triviales (typos, docs puros, sync de dependencias sin cambio funcional). Uso explícito, queda en el historial del comando y se documenta en el body del PR.

## Flujo

### 1. Chequeos previos

- Rama actual: si es `main`, `develop` o `master` → **parate**. No se abren PRs desde ramas protegidas.
- Working tree: debe estar limpio (`git status --short` vacío). Si no, avisá al user — decide si commitea o stashea primero.
- `gh` instalado y autenticado (`gh auth status`). Si falla, avisá: `brew install gh && gh auth login`.
- Detectar flag `--skip-qa` en `$ARGUMENTS`.

### 2. QA automático con `qa-engineer` (obligatorio salvo `--skip-qa`)

Si **no** se pasó `--skip-qa`, delegá al subagente `qa-engineer`:

- Enviale:
  - Objetivo de la feature (del último mensaje del user o del primer commit).
  - Criterios de aceptación (si están en el ticket o deducibles de los commits).
  - Diff: `git diff origin/develop...HEAD`.
  - Lista de skills que cargaste durante el trabajo.

- Esperá la salida del subagente:
  - **APROBADO** → seguí con el paso 3.
  - **BLOQUEANTES** → mostrale la lista al user y **pará**. El PR no se abre hasta resolverlos. Cuando los resuelvas, el user pide `/pr` de nuevo.

Si el user pasó `--skip-qa`:
- Dejá constancia en el body del PR: `> QA skipped por flag explícito del user (<motivo breve>).`
- Seguí sin invocar al subagente.
- Si sospechás que el cambio no es trivial y el `--skip-qa` es un atajo equivocado, avisale al user antes de continuar.

### 3. Push si hace falta upstream

```bash
git push -u origin <rama>
```

Si ya tiene upstream, un `git push` normal. Si hay divergencia remota, parar y pedir confirmación al user.

### 4. Armar título y body

**Título**: conventional commit que represente el scope global del cambio (`type(scope): description`).

**Body** (template obligatorio):

```markdown
## Summary
- <bullet 1>
- <bullet 2>

## Commits
$(git log --oneline origin/develop..HEAD)

## QA
<si QA corrió>
✓ qa-engineer aprobó el PR.

<si QA fue skipped>
⚠️ QA skipped por flag `--skip-qa` (cambio trivial: <razón breve>).

## Test plan
- [ ] <qué probar>
```

Inferí bullets y test plan del diff + commits. Si no hay señal clara, dejá placeholders y avisá.

### 5. Crear el PR

```bash
gh pr create \
  --base develop \
  --head <rama> \
  --title "<conventional title>" \
  --body "$(cat <<'EOF'
...body...
EOF
)"
```

**Base siempre `develop`. Sin excepción.** No aceptes `--base main` aunque el user lo pida — explicale que el flujo es `/release` + aprobación humana manual.

### 6. Reportar

Devolvele al user:
```
✓ PR abierto: <url>
✓ Base: develop
<si QA corrió>
✓ qa-engineer: APROBADO
<si QA fue skipped>
⚠️ QA skipped (flag --skip-qa)
```

### 7. Ofrecer siguiente paso

Preguntale con `AskUserQuestion`:
- ¿Mergear este PR a develop ahora con `/merge-pr`?

Si dice sí → invocá `/merge-pr <N>`. Si dice no → terminá.

## Qué NO hacés

- Abrir PR a `main` (bloqueado por hook + esta guía).
- Mergear vos mismo (para eso `/merge-pr`).
- Aprobar formalmente vía `gh pr review --approve` (falla por self-authorship y además no aplica acá).
- Saltar QA sin flag explícito `--skip-qa`.
- Armar body sin summary y test plan (si faltan datos, pedilos al user).
