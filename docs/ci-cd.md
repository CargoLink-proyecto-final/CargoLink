# CI/CD

Deploy continuo a **Google Cloud Run** con GitHub Actions. Cada merge a una rama de entorno builda las imágenes Docker, las publica a **Artifact Registry** y actualiza el servicio de Cloud Run del entorno correspondiente.

Source: [`../.github/workflows/deploy-gcp.yml`](../.github/workflows/deploy-gcp.yml).

> El detalle de la infraestructura GCP (Cloud Run, Cloud SQL, Secret Manager, los dos entornos y el setup de Workload Identity Federation) está en [`../infra/gcp/README.md`](../infra/gcp/README.md). Esta página cubre el pipeline.

## Dos entornos

| | dev | prod |
|---|---|---|
| Dispara con | merge/push a `develop` | merge/push a `main` |
| Cloud Run | `cargolink-dev-backend` / `cargolink-dev-frontend` | `cargolink-backend` / `cargolink-frontend` |
| Artifact Registry | `cargolink-dev` | `cargolink` |
| Backend min instances | 0 (escala a cero) | 1 (caliente) |

Ambos entornos viven en el mismo proyecto GCP `project-9dc11c1e-5a14-4076-a74`, con DB, secrets y service account propios por entorno (ver `infra/gcp/README.md`).

## Cuándo dispara

```yaml
on:
  push:
    branches: [develop, main]
```

Solo `push` directo a esas ramas (incluye merges de PR, porque GitHub registra el merge como push a la rama base). **Los PRs no disparan el deploy** — la validación pasa por el flujo de `/pr` + el subagente `qa-engineer` antes del merge (ver [`workflow-claude-code.md`](./workflow-claude-code.md)).

## Qué hace

```
push a develop o main
       │
       ▼
  job: deploy (ubuntu-latest)
       │
       ├── checkout
       ├── resolve environment (main→prod / develop→dev): infix + repo de Artifact Registry
       ├── auth a GCP vía Workload Identity Federation (OIDC, keyless)
       ├── setup gcloud + docker auth a Artifact Registry
       ├── resolver URL del backend del entorno (gcloud run services describe)
       ├── build & push backend  → .../cargolink[-dev]/cargolink-backend:<env>-<sha>
       ├── build & push frontend → .../cargolink[-dev]/cargolink-frontend:<env>-<sha>
       │     build-arg NEXT_PUBLIC_API_URL=<backend-url>/api  (resuelto en vivo)
       ├── gcloud run deploy backend  --image <nueva imagen>
       └── gcloud run deploy frontend --image <nueva imagen>
```

Las imágenes se taggean `<env>-<sha-7>` (`dev-abc1234`, `prod-abc1234`).

## Autenticación: Workload Identity Federation (keyless)

No hay keys de service account guardadas en GitHub. El workflow se autentica por OIDC:

```yaml
permissions:
  contents: read
  id-token: write   # requerido para el token OIDC de WIF

- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: projects/.../workloadIdentityPools/github-pool/providers/github-provider
    service_account: github-deployer@project-9dc11c1e-5a14-4076-a74.iam.gserviceaccount.com
```

GitHub emite un token OIDC; GCP lo valida contra el provider (restringido al repo `CargoLink-proyecto-final/CargoLink`) y deja al workflow impersonar la SA `github-deployer`. Esa SA tiene los roles mínimos: `run.admin` (deploy), `artifactregistry.writer` (push), `iam.serviceAccountUser` (correr Cloud Run como la SA de runtime). El provider y la SA email **no son secretos** → van como `env:` en el workflow. El setup (pool, provider, SA, roles) está documentado en `infra/gcp/README.md`.

## El frontend y `NEXT_PUBLIC_API_URL`

`NEXT_PUBLIC_API_URL` se hornea en build-time del frontend (Next la baja al bundle al compilar). El workflow resuelve la URL del backend del entorno en vivo con `gcloud run services describe` y la pasa como `--build-arg`, así cada entorno apunta a su propio backend sin config manual.

## División de responsabilidad: Terraform vs CI

- **Terraform** (`infra/gcp/`) es dueño de la infra: Cloud SQL, secrets, env vars, scaling, IAM, y la creación inicial de los servicios Cloud Run.
- **CI** es dueño de la **imagen**: cada deploy actualiza solo la imagen del servicio con `gcloud run deploy --image`.

Para que no se pisen, los recursos `google_cloud_run_v2_service` tienen `lifecycle { ignore_changes = [template[0].containers[0].image] }`. Resultado: CI cambia la imagen sin generar drift en el state de Terraform.

> Los servicios Cloud Run deben existir (provisionados por Terraform) **antes** del primer deploy de CI. El step "Resolve backend URL" falla con mensaje claro si el backend del entorno no existe.

## Por qué no hay CI de tests / lint

El repo tiene infraestructura de tests (Jest en backend) pero **no tiene tests escritos todavía**, y no hay step de lint. Es deliberado por etapa del proyecto — la calidad pasa por el flujo de PR + el subagente `qa-engineer`.

Cuando se sumen tests, lo natural sería un workflow `pr-checks.yml` que dispare en `pull_request` y corra `npm test` + lint (backend y frontend), gating del merge, manteniendo `deploy-gcp.yml` separado (solo post-merge).

## PR template

Source: [`../.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

Estructura mínima — Summary, Commits, Test plan, Checklist. La completa el comando `/pr` con el output del subagente `qa-engineer`.

## Rollback

`gcloud run deploy` crea una revisión nueva por cada deploy. Para volver atrás:

```bash
# Listar revisiones del servicio
gcloud run revisions list --service=cargolink-backend --region=southamerica-east1

# Mandar el 100% del tráfico a una revisión previa (rollback instantáneo, sin rebuild)
gcloud run services update-traffic cargolink-backend \
  --region=southamerica-east1 --to-revisions=<REVISION-PREVIA>=100
```

O re-deployar una imagen anterior por SHA (siguen en Artifact Registry):

```bash
gcloud run deploy cargolink-backend \
  --image=southamerica-east1-docker.pkg.dev/project-9dc11c1e-5a14-4076-a74/cargolink/cargolink-backend:prod-abc1234 \
  --region=southamerica-east1
```

⚠️ El rollback de imagen **no revierte una migración Prisma** que ya haya corrido al startup. Si la migración rompió datos, primero restaurá el backup de la DB (ver [`deployment.md`](./deployment.md)).

## Caveats

- **El deploy no corre tests** — solo falla si el build de Docker o el `gcloud run deploy` fallan. Mergear código roto es posible; mitigado por `/pr` + `qa-engineer`.
- **Migraciones en CI**: no se corren en el pipeline. Se aplican al startup del contenedor (`docker-entrypoint.sh` → `prisma migrate deploy` + seed). Un error de migración se descubre en el deploy, no antes.
- **No detecta secretos commiteados** — vale sumar un step con `trufflehog` o similar.
- **dev escala a cero** (`min-instances=0`): el primer request tras un período idle tiene cold start, y el seed se re-ejecuta (idempotente). prod queda caliente (`min=1`).
- **Sin trigger manual** (`workflow_dispatch`). Para re-deployar sin push, agregarlo al `on:` block o pushear un commit.
