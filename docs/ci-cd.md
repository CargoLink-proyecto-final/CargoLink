# CI/CD

Deploy continuo al **VPS propio** (`ubuntu-tesis01`) con GitHub Actions y un **runner self-hosted** que corre en el mismo VPS. Cada merge a una rama de entorno actualiza el clone de ese entorno, buildea las imágenes ahí mismo y reemplaza los contenedores.

- Workflow: [`../.github/workflows/deploy-vps.yml`](../.github/workflows/deploy-vps.yml)
- Script: [`../deploy/vps/deploy.sh`](../deploy/vps/deploy.sh)
- Por qué este diseño y qué se descartó: [`decision-deploy-vps.md`](./decision-deploy-vps.md)
- Layout del VPS, túnel, backups y operación: [`deployment.md`](./deployment.md)

> `deploy-gcp.yml` (Cloud Run) está **desactivado**: ya no dispara en push y queda solo con `workflow_dispatch` hasta que se apague GCP.

## Dos entornos

| | dev | prod |
|---|---|---|
| Dispara con | merge/push a `develop` | merge/push a `main` |
| Clone en el VPS | `~/cargolink-dev` (rama `develop`) | `~/cargolink` (rama `main`) |
| Override compose | `deploy/vps/compose.dev.yml` | `deploy/vps/compose.prod.yml` |
| Proyecto compose | `cargolink-dev` | `cargolink` |
| URL pública | https://dev.cargolink.com.ar | https://plataforma.cargolink.com.ar |
| Backup pre-deploy | no | **sí** (`~/backups/backup.sh`) |

## Cuándo dispara

```yaml
on:
  push:
    branches: [develop, main]
```

Solo `push` a esas ramas, lo que incluye los merges de PR. Además, el job repite el guard (`github.event_name == 'push'` y rama `main`/`develop`) por si alguien toca el `on:`.

**Nunca** agregues `pull_request` ni `workflow_dispatch` a un workflow que use el runner self-hosted: ejecutaría código no revisado en el VPS con acceso a Docker. La validación de PRs pasa por `/pr` + `qa-engineer` (ver [`workflow-claude-code.md`](./workflow-claude-code.md)).

Hay un grupo de `concurrency` por rama sin cancelar el deploy en curso. Si llegan varios pushes seguidos, solo queda encolado el último. Con un único runner, un deploy de dev y uno de prod nunca corren a la vez.

## Qué hace

```
push a develop o main
       │
       ▼
  job deploy-<env>   (runs-on: self-hosted, linux, cargolink-vps)
       │
       ├── checkout sparse de deploy/vps/ (el script del commit que se deploya)
       └── deploy/vps/deploy.sh <env> <sha>
             ├── valida el clone: rama correcta, sin cambios trackeados; en prod, que exista backup.sh
             ├── flock global (un deploy por vez en el host)
             ├── git fetch + merge --ff-only <sha>
             ├── tag <proyecto>-{backend,frontend}:latest → :previous   (rollback)
             ├── docker compose build backend frontend   (los contenedores viejos siguen sirviendo)
             ├── [prod] ~/backups/backup.sh  → si falla, aborta sin tocar contenedores
             ├── docker compose up -d --no-build
             │     el backend corre prisma migrate deploy + seed al arrancar
             ├── healthcheck por la URL pública (hasta 300 s):
             │     GET /                    → 200
             │     GET /api/geo/provinces   → 401 (sin token)
             │     si falla: ps + logs del backend/frontend y el job queda en rojo
             └── docker image prune + builder prune (cache > 7 días)
```

El resultado queda en el *job summary* de Actions. El script **nunca** hace `docker compose down` ni borra volúmenes.

## El frontend y `NEXT_PUBLIC_API_URL`

`NEXT_PUBLIC_API_URL` se hornea en build-time. El override de cada entorno lo arma desde el `.env` del clone:

```yaml
frontend:
  build:
    args:
      NEXT_PUBLIC_API_URL: https://${APP_HOST}/api
```

El frontend y la API comparten dominio. Cloudflare Tunnel manda `/api/*` al backend y el resto al frontend.

## Autenticación y secretos

- **No hay secretos en GitHub** para este workflow. El runner corre como `mfrias` en el VPS.
- `git fetch` usa el fine-grained PAT de solo lectura de `~/.git-credentials` (vence **2027-09-13**).
- Los secretos de la app (DB, JWT, SMTP, admin) viven en el `.env` de cada clone y no salen del VPS.
- El checkout del workflow usa el `GITHUB_TOKEN` del job con `contents: read` y `persist-credentials: false`.

## Rollback

Ver [`deployment.md`](./deployment.md) § Rollback. En resumen: retaggear `:previous` como `:latest` y correr `up -d --no-build`. Si hubo una migración que rompió datos, **primero** hay que restaurar el backup pre-deploy.

## Re-deployar sin push

No hay disparo manual en Actions (a propósito, ver arriba). Desde el VPS:

```bash
~/cargolink/deploy/vps/deploy.sh prod        # o: ~/cargolink-dev/deploy/vps/deploy.sh dev
```

Sin SHA, deploya la punta de `origin/main` u `origin/develop`.

## Por qué no hay CI de tests / lint

El repo tiene infraestructura de tests (Jest en backend) pero **todavía no tiene tests escritos**, y no hay step de lint. Es deliberado por la etapa del proyecto: la calidad pasa por el flujo de PR + el subagente `qa-engineer`.

Cuando se sumen tests, lo natural sería un workflow `pr-checks.yml` en `pull_request` sobre **runners hosteados por GitHub** (`ubuntu-latest`, nunca el self-hosted) que corra `npm test` + lint, manteniendo `deploy-vps.yml` separado y solo post-merge.

## PR template

Source: [`../.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

Estructura mínima: Summary, Commits, Test plan y Checklist. La completa el comando `/pr` con el output del subagente `qa-engineer`.

## Caveats

- **El deploy no corre tests.** Solo falla si falla el build, el backup, el `up` o el healthcheck. Mergear código roto es posible; lo mitigan `/pr` + `qa-engineer`.
- **Las migraciones no corren en el pipeline**: se aplican al arrancar el backend. Un error de migración se descubre en el healthcheck, después del backup.
- **Si el runner está offline**, el job queda encolado (GitHub lo descarta a las 24 h). Estado: *Settings → Actions → Runners*. Plan B: correr el script a mano.
- **Build en el mismo host que prod**: durante unos 7 minutos compite por CPU con los contenedores en uso.
- **No detecta secretos commiteados.** Vale sumar `trufflehog` o similar en un workflow de PR sobre runners de GitHub.
