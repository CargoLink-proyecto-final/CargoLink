---
description: Abre un PR de develop → main para release. Nunca aprueba ni mergea — eso lo hace el mantenedor humano manualmente.
---

El usuario quiere abrir un PR de **release** (`develop → main`). Este es el **único** comando de Claude que toca `main`, y solo para **abrir** el PR. Nunca lo aprueba, nunca lo mergea.

## Reglas fundamentales — no negociables

- Claude **abre** el PR. El mantenedor humano lo revisa, lo aprueba y lo mergea **desde GitHub** con su cuenta.
- **Nunca** ejecutes `gh pr merge <N>` donde base=main. El hook `PreToolUse` lo bloquea. Si el hook falla por algún motivo, **esta instrucción es tu backup**.
- **Nunca** ejecutes `gh pr review --approve <N>` donde base=main. Mismo razonamiento.
- Si el user te pide "mergealo vos" a este PR → explicale la regla y rechazá educadamente. El merge a main es operación de release humana.

## Flujo

### 1. Verificar que hay algo para releasear

```bash
git fetch origin
# Cuántos commits tiene develop por delante de main.
AHEAD=$(git rev-list --count origin/main..origin/develop)
# Cuántos tiene main por delante de develop (debería ser 0, gitflow limpio).
BEHIND=$(git rev-list --count origin/develop..origin/main)
```

- Si `AHEAD = 0` → no hay nada para releasear, paro y avisá.
- Si `BEHIND > 0` → main tiene commits que develop no (hotfix sin back-merge?). Avisá y pedí decisión humana antes de continuar.

Listar los commits que entrarían:
```bash
git log --oneline origin/main..origin/develop | head -30
```

### 2. Pedir aprobación explícita del user

Usar `AskUserQuestion` con contexto:
- Cantidad de commits para releasear.
- Rango: `<main-sha-corto>..<develop-sha-corto>`.
- Fecha del commit más reciente de develop.
- Enlace de comparación: `https://github.com/<owner>/<repo>/compare/main...develop`.

Opciones:
- **Sí, abrir el PR de release** (recomendado solo si el user confirmó que develop está listo).
- **No, cancelar**.

Si cancela → termino.

### 3. Verificar que no hay un PR de release abierto ya

```bash
gh pr list --base main --head develop --state open --json number,title
```

Si ya hay uno → devolver su URL y parar. No crear un segundo.

### 4. Delegar al subagente `release-engineer` para armar el informe del release

**Obligatorio** — no armes el body vos mismo, delegá al subagente que tiene el contexto específico de análisis de release.

Invocá al subagente `release-engineer` pasándole:
- `origin/main` — commit base (último release).
- `origin/develop` — commit target.
- Rango explícito: `<main-sha-corto>..<develop-sha-corto>`.

El subagente devuelve un **informe Markdown estructurado** con 5 secciones fijas:
- Resumen del release (commits, fechas, contribuidores).
- Migraciones incluidas con clasificación de riesgo (🟢/🟡/🔴).
- Breaking changes detectados (endpoints NestJS eliminados/renombrados, DTOs o validación class-validator alterados, campos de modelos Prisma eliminados).
- Release notes (borrador) agrupados por tipo desde conventional commits.
- Checklist operacional para el mantenedor humano.

Ver `.claude/agents/release-engineer.md` para los detalles del output esperado.

**Si `release-engineer` reporta que el release está vacío** (0 commits) → abortá `/release` con el mensaje del subagente.

### 5. Armar título del PR

**Título** (queda fijo, no depende del subagente):
```
release: sync main with develop (<N> commits)
```

### 6. Armar body del PR

El body = el informe completo del `release-engineer` **+ un pie con notas y disclaimer**:

```markdown
<informe de release-engineer — 5 secciones>

## Notas

Este PR fue **abierto por Claude Code** siguiendo el flujo `/release`. El merge a `main` es responsabilidad del mantenedor humano y **no se hace desde Claude Code** (regla dura del workflow).

Al mergear a `main`, el workflow `deploy-vps.yml` deploya **automáticamente a prod** en el VPS (runner self-hosted): build de las imágenes, backup de la DB de prod, `docker compose up -d` y healthcheck (ver `docs/ci-cd.md`). El backend corre `prisma migrate deploy` al arrancar el contenedor, así que las migraciones listadas arriba se aplican en ese deploy, inmediatamente después del backup automático. Revisá las 🔴 y 🟡 antes de mergear y, si hay 🔴, probá el restore en dev. Rollback: `docs/deployment.md` § Rollback.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 7. Crear el PR

```bash
gh pr create \
  --base main \
  --head develop \
  --title "release: sync main with develop (<N> commits)" \
  --body "<body armado = informe release-engineer + notas>"
```

### 8. Devolver URL al user

Formato:
```
✓ PR de release abierto: <url>

⚠️  Este PR NO lo va a mergear Claude. Vos (o otro mantenedor) tenés que:
    1. Revisarlo en GitHub.
    2. Aprobarlo con tu cuenta.
    3. Mergearlo desde GitHub UI o con gh desde tu propia terminal.

Después del merge en main, hacé back-merge o reset de develop según tu flujo.
```

**Terminá acá.** No hagas nada más. No ofrezcas mergear, no preguntes si querés, no `gh pr merge`.

## Qué NO hacés en este comando

- `gh pr merge <N>` (bloqueado por hook + esta guía).
- `gh pr review --approve <N>` (idem).
- Editar `main` directamente.
- Crear commits sobre `develop` como parte del release (los commits ya están).
- Abrir múltiples PRs de release simultáneos.
- Mergear si el user te insiste — rechazá educadamente y explicá la política.
