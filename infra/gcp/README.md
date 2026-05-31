# Deploy de CargoLink en Google Cloud (Terraform)

Este directorio contiene el Terraform para desplegar CargoLink en **Google Cloud Run + Cloud SQL**, pensado para correr cómodamente dentro de los **$300 de crédito gratis** de GCP.

Terraform automatiza **toda la infraestructura**. Lo que **vos hacés a mano** está marcado con 🔧 y se explica paso a paso más abajo.

---

## Qué crea este Terraform

| Recurso | Para qué |
|---|---|
| **Artifact Registry** (repo Docker) | Cloud Run no puede traer imágenes de GHCR directamente → las imágenes viven acá. |
| **Cloud SQL** (PostgreSQL 15) | Base de datos administrada. Tier `db-f1-micro` (el más barato). |
| **Cloud Run — backend** | NestJS. Conecta a Cloud SQL por socket unix. Público. |
| **Cloud Run — frontend** | Next.js standalone. Público. Se despliega en la **fase 2**. |
| **Secret Manager** | `DATABASE_URL`, `JWT_SECRET` y (opcional) `SMTP_PASSWORD`. Nunca en texto plano en el contenedor. |
| **Service Account + IAM** | Identidad de runtime con permisos mínimos (Cloud SQL client + lectura de secrets). |

```
                  Internet
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
  Cloud Run (frontend)      Cloud Run (backend) ──► Secret Manager
  Next.js :8080             NestJS :8080              (DATABASE_URL, JWT_SECRET)
        │                         │
        │  fetch <backend>/api    │ socket unix /cloudsql/...
        └────────────────────────┴──► Cloud SQL (PostgreSQL 15)
```

> **Mobile (Expo) queda fuera de scope.** La app React Native no se "despliega" en GCP: se buildea y distribuye con Expo/EAS. Solo necesita apuntar `NEXT_PUBLIC_API_URL` / la URL del backend a la URL pública de Cloud Run.

---

## ⚠️ El problema del huevo y la gallina (leer antes de empezar)

CargoLink tiene una particularidad que obliga a desplegar en **2 fases**:

- **`NEXT_PUBLIC_API_URL` se "hornea" en build-time** del frontend (es una env var de Next que se baja al bundle al compilar, no en runtime). Para buildear el frontend necesitás **ya conocer la URL del backend**.
- Pero la URL del backend (`https://cargolink-backend-xxxx.run.app`) recién existe **después** de desplegarlo.

Por eso el flujo es:

1. **Fase 1** → desplegar backend (y DB, secrets, etc.). Obtener su URL.
2. Buildear el frontend con esa URL.
3. **Fase 2** → desplegar el frontend. Terraform además re-cablea automáticamente el `CORS_ORIGIN` del backend a la URL del frontend.

---

## 🔧 Prerrequisitos (una sola vez)

### 1. Herramientas locales

```bash
# Terraform
brew install terraform          # macOS
# gcloud CLI
brew install --cask google-cloud-sdk
# Docker (Desktop) — ya lo tenés para el dev local
```

### 2. Activar el crédito y crear el proyecto

1. Entrá a <https://console.cloud.google.com> y activá los **$300 de crédito gratis** (necesitás una tarjeta para verificación; no se cobra hasta que se agote el crédito o lo actives manualmente).
2. Creá un proyecto nuevo (anotá el **Project ID**, no el nombre — algo como `cargolink-123456`).
3. Asegurate de que el proyecto tenga **billing habilitado** (Billing → Link a billing account). Sin esto, las APIs no se pueden habilitar.

> Estos pasos son por consola web (o `gcloud projects create` + `gcloud billing`), no por Terraform — Terraform necesita un proyecto con billing ya existente para operar.

### 3. Autenticación (corré estos comandos vos, son interactivos)

En la terminal de Claude Code podés ejecutarlos prefijando con `!`:

```bash
gcloud auth login                                   # login de tu cuenta Google
gcloud config set project cargolink-123456          # tu Project ID
gcloud auth application-default login               # credenciales que usa Terraform (ADC)
```

---

## Deploy paso a paso

### Paso 0 — Configurar variables

```bash
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars
```

Editá `terraform.tfvars`:
- `project_id` → tu Project ID.
- `backend_image` → la ruta destino en Artifact Registry. **Ya podés escribirla aunque la imagen todavía no exista** (es solo un string); el formato es:
  `southamerica-east1-docker.pkg.dev/<project_id>/cargolink/cargolink-backend:v1`
- `frontend_image` → dejalo **vacío** por ahora.

```bash
terraform init
```

### Paso 1 — Crear Artifact Registry (y habilitar APIs)

Necesitamos el registro **antes** de poder pushear imágenes:

```bash
terraform apply -target=google_artifact_registry_repository.docker
```

Esto habilita las APIs necesarias y crea el repo. (La primera habilitación de APIs puede tardar 1-2 min.)

### Paso 2 — 🔧 Buildear y pushear la imagen del backend

```bash
# Autenticar Docker contra Artifact Registry (una sola vez por región)
gcloud auth configure-docker southamerica-east1-docker.pkg.dev

# IMPORTANTE: --platform linux/amd64 (Cloud Run corre amd64; si estás en Mac
# con Apple Silicon, sin esto la imagen no arranca).
docker build --platform linux/amd64 \
  -t southamerica-east1-docker.pkg.dev/<project_id>/cargolink/cargolink-backend:v1 \
  ../../backend

docker push southamerica-east1-docker.pkg.dev/<project_id>/cargolink/cargolink-backend:v1
```

### Paso 3 — Desplegar el backend + DB + secrets (Fase 1)

```bash
terraform apply
```

Terraform crea Cloud SQL, los secrets, la service account y el servicio de backend. Al final imprime los outputs. Guardá la URL:

```bash
terraform output -raw backend_api_url
# → https://cargolink-backend-xxxx.southamerica-east1.run.app/api
```

> En esta fase el `CORS_ORIGIN` del backend apunta al fallback (`localhost`). Se corrige solo en la fase 2.

**Verificá el backend** (las migraciones Prisma corren solas en el arranque; puede tardar la primera vez):

```bash
curl $(terraform output -raw backend_url)/api/docs   # debe responder 200 (Swagger)
```

### Paso 4 — 🔧 Buildear el frontend con la URL del backend

```bash
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=$(terraform output -raw backend_api_url) \
  -t southamerica-east1-docker.pkg.dev/<project_id>/cargolink/cargolink-frontend:v1 \
  ../../frontend

docker push southamerica-east1-docker.pkg.dev/<project_id>/cargolink/cargolink-frontend:v1
```

### Paso 5 — Desplegar el frontend (Fase 2)

En `terraform.tfvars`, seteá `frontend_image` a la ruta que acabás de pushear:

```hcl
frontend_image = "southamerica-east1-docker.pkg.dev/<project_id>/cargolink/cargolink-frontend:v1"
```

```bash
terraform apply
```

Esto crea el frontend **y** actualiza el `CORS_ORIGIN`/`FRONTEND_URL` del backend a la URL real del frontend (Terraform lo resuelve automáticamente).

```bash
terraform output -raw frontend_url
# → https://cargolink-frontend-xxxx.southamerica-east1.run.app
```

### Paso 6 — 🔧 Smoke test

1. Abrí la `frontend_url` en el browser.
2. Login con una cuenta demo (`admin@cargolink.com` / `password123` — la crea el seed del backend).
3. Verificá que el dashboard cargue datos (eso confirma que el frontend habla con el backend y el backend con la DB).

✅ **Listo, CargoLink está en producción en GCP.**

---

## Actualizar (redeploy) después de cambios de código

```bash
# Backend
docker build --platform linux/amd64 -t .../cargolink-backend:v2 ../../backend
docker push .../cargolink-backend:v2
# actualizá backend_image = "...:v2" en terraform.tfvars
terraform apply

# Frontend (recordá el build-arg con la URL del backend)
docker build --platform linux/amd64 --build-arg NEXT_PUBLIC_API_URL=$(terraform output -raw backend_api_url) -t .../cargolink-frontend:v2 ../../frontend
docker push .../cargolink-frontend:v2
# actualizá frontend_image = "...:v2"
terraform apply
```

> Usá tags versionados (`:v2`, `:v3`, …) en vez de reusar `:v1`. Cloud Run necesita un cambio en la referencia de imagen para desplegar una revisión nueva.

---

## Costos y cómo no quemar el crédito

| Recurso | Costo aprox. (con tráfico bajo) |
|---|---|
| Cloud SQL `db-f1-micro` | ~USD 8–10 / mes (corre 24/7, **no** escala a cero) |
| Cloud Run backend (`min=1`) | ~USD 5–12 / mes (1 instancia caliente) |
| Cloud Run frontend (`min=0`) | ~USD 0 en reposo (escala a cero) |
| Artifact Registry + Secret Manager | centavos |

Con $300 te alcanza para **varios meses**. Para estirarlo más:
- `backend_min_instances = 0` → el backend escala a cero (ahorra, pero suma cold starts y **vuelve a correr el seed en cada arranque**, ver caveats).
- `db_tier = "db-f1-micro"` ya es el más barato.
- **Apagá todo cuando no lo uses** con `terraform destroy` (ver abajo).
- Poné un **presupuesto con alertas** en Billing → Budgets & alerts (🔧 manual, muy recomendado).

---

## Bajar todo (teardown)

```bash
terraform destroy
```

Borra Cloud Run, Cloud SQL, secrets, etc. Con `db_deletion_protection = false` (el default acá) la DB se borra sin trabas.

> ⚠️ Esto **borra la base de datos**. Si querés conservar datos, tomá un backup antes:
> `gcloud sql export sql $(terraform output -raw db_instance_name) gs://<tu-bucket>/backup.sql --database=cargolink`

---

## Caveats importantes (específicos de CargoLink)

### Migraciones y seed en cada arranque
El `backend/docker-entrypoint.sh` corre `prisma migrate deploy` **y** el seed en cada arranque del contenedor.
- `migrate deploy` es idempotente (no-op si la DB está al día). OK.
- El **seed** vuelve a correr en cada cold start. Con `backend_min_instances = 1` (default) la instancia queda caliente y prácticamente no se reinicia → el seed corre una vez. Si ponés `min=0`, considerá hacer el seed idempotente o sacarlo del entrypoint para producción.

### WebSockets (Socket.IO) → una sola instancia
El chat usa Socket.IO con el adapter **en memoria**. Con más de una instancia de backend, los clientes conectados a instancias distintas no se ven entre sí. Por eso `backend_max_instances = 1` por default.
- Para escalar horizontalmente el backend, hay que sumar el **adapter de Redis** de Socket.IO (`@socket.io/redis-adapter` + un Memorystore/Redis) y recién ahí subir `max_instances`.

### `NEXT_PUBLIC_API_URL` es build-time
Si cambiás la URL del backend (p. ej. mapear un dominio propio), tenés que **re-buildear** el frontend con el nuevo valor. No se puede cambiar por env var en runtime.

### CORS soporta un solo origen
`main.ts` lee un único `CORS_ORIGIN`. Si necesitás varios orígenes (ej. web + un dominio extra), hay que parsear coma-separados en el backend (hoy no lo hace).

---

## Dominios custom

> ⚠️ **Cloud Run domain mappings NO están soportados en `southamerica-east1`.** Por eso los dominios custom se exponen vía un **Application Load Balancer global externo + Serverless NEGs** (región-independiente, una IP anycast única). Definido en `main.tf` (bloque "Dominios custom"), opt-in por entorno.

### Cómo se activa
Seteá los dominios en el tfvars del entorno (vacío = no se crea nada):

```hcl
# terraform.tfvars (prod)
frontend_domain = "app.cargolink.com.ar"
backend_domain  = "api.cargolink.com.ar"

# dev.tfvars (dev) — OJO: terraform.tfvars (prod) se auto-carga; seteá los de dev
# explícitamente o dev hereda los de prod (mismo gotcha que SMTP).
frontend_domain = "dev.cargolink.com.ar"
backend_domain  = "api.dev.cargolink.com.ar"
```

Si ambos quedan vacíos, **no se crea el LB** (ni la API `compute`, ni IP, ni cert) → cero costo extra. Cada entorno tiene su **propio LB y su propia IP anycast**.

### Qué crea
Por entorno: una IP global estática, Serverless NEG por servicio (front/back), backend services, un certificado SSL managed (cubre ambos dominios), URL map que rutea por host, target HTTPS proxy + forwarding rule en :443, y un redirect :80 → :443.

### Pasos de DNS (donweb)
1. `terraform apply` (en el workspace del entorno).
2. `terraform output lb_ip` → IP anycast del LB.
3. En el panel **Zona DNS de donweb**, creá un registro **`A`** por subdominio apuntando a esa IP (ej. `app` y `api` → `<lb_ip>`).
4. Esperá la propagación DNS. **Recién ahí** Google provisiona el cert managed (hasta ~60 min). Chequeá el estado con:
   `gcloud compute ssl-certificates describe $(terraform output -raw lb_cert_name) --global --format='value(managed.status)'` (pasa de `PROVISIONING` a `ACTIVE`).
   - Apex desnudo (`@`): donweb debe permitir un `A` en la raíz. Los subdominios (`app.`/`api.`) siempre funcionan.

### Cambios de app que siguen siendo necesarios
- **Re-buildear el frontend** con `NEXT_PUBLIC_API_URL=https://<backend_domain>/api` (es build-time, ver gotcha arriba).
- **Ampliar `CORS_ORIGIN`** al nuevo dominio del frontend (y sumar parseo coma-separado si querés mantener también el origen `.run.app`).

---

## Entornos dev / prod + CI/CD

CargoLink corre **dos entornos en el mismo proyecto** `cargo-link-2026`, separados por nombre y con DB propia:

| | prod | dev |
|---|---|---|
| Trigger de deploy | merge/push a `main` | merge/push a `develop` |
| Cloud Run | `cargolink-backend` / `cargolink-frontend` | `cargolink-dev-backend` / `cargolink-dev-frontend` |
| Cloud SQL | `cargolink-db` | `cargolink-dev-db` |
| Secrets | `cargolink-*` | `cargolink-dev-*` |
| Artifact Registry | `cargolink` | `cargolink-dev` |
| Cloud Run runtime SA | `cargolink-run` | `cargolink-dev-run` |
| Backend min instances | 1 (caliente) | 0 (escala a cero) |

Los entornos se manejan con **workspaces de Terraform** (`default` = prod, `dev` = dev) sobre la misma config. El entorno se elige con `var.environment` (default `prod`):

```bash
# prod (workspace default, usa terraform.tfvars):
terraform workspace select default
terraform apply

# dev (workspace dev, usa dev.tfvars):
terraform workspace new dev      # solo la primera vez
terraform workspace select dev
terraform apply -var-file=dev.tfvars
```

> `var.environment = "prod"` NO prefija (conserva los nombres existentes); cualquier otro valor prefija con `<env>-`. Así prod nunca se recrea al introducir dev.

### CI/CD — `.github/workflows/deploy-gcp.yml`

Deploy continuo a Cloud Run, **keyless** vía Workload Identity Federation (sin keys en GitHub):

- `push` a `develop` → builda y deploya el entorno **dev**.
- `push` a `main` → builda y deploya **prod**.

El workflow buildea las imágenes (frontend con `NEXT_PUBLIC_API_URL` resuelto en vivo desde la URL del backend del entorno), las pushea al Artifact Registry del entorno, y actualiza el servicio con `gcloud run deploy --image`. Terraform tiene `ignore_changes` sobre la imagen, así que **CI es dueño de la imagen** y Terraform del resto (Cloud SQL, secrets, env vars, scaling). No hay drift.

**Setup GCP del CI (una sola vez, ya hecho — documentado para reproducir):**

```bash
# Pool + provider OIDC restringido al repo
gcloud iam workload-identity-pools create github-pool --location=global --project=cargo-link-2026
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github-pool \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository=='CargoLink-proyecto-final/CargoLink'" --project=cargo-link-2026
# SA deployer + roles + binding WIF
gcloud iam service-accounts create github-deployer --project=cargo-link-2026
for R in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding cargo-link-2026 \
    --member="serviceAccount:github-deployer@cargo-link-2026.iam.gserviceaccount.com" --role="$R" --condition=None
done
gcloud iam service-accounts add-iam-policy-binding github-deployer@cargo-link-2026.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/772498480601/locations/global/workloadIdentityPools/github-pool/attribute.repository/CargoLink-proyecto-final/CargoLink"
```

El workflow referencia el provider y la SA por env vars (no son secretos). Los servicios Cloud Run deben existir (provisionados por Terraform) antes del primer deploy de CI.

## State remoto (opcional, recomendado si trabajan varios)

Por default el `terraform.tfstate` queda en tu disco. Para compartirlo y no perderlo, movelo a un bucket GCS:

```bash
gsutil mb -l southamerica-east1 gs://cargolink-tfstate-<sufijo-unico>
```

Después descomentá el bloque `backend "gcs"` en `versions.tf` y corré `terraform init -migrate-state`.

---

## Archivos de este directorio

| Archivo | Contenido |
|---|---|
| `versions.tf` | Versiones de Terraform/providers + config del provider Google. |
| `variables.tf` | Todas las variables con sus defaults y descripciones. |
| `main.tf` | Los recursos (APIs, Artifact Registry, Cloud SQL, secrets, Cloud Run, IAM). |
| `outputs.tf` | URLs y datos útiles post-deploy. |
| `terraform.tfvars.example` | Plantilla de variables — copiala a `terraform.tfvars`. |
| `.gitignore` | Evita commitear state y `*.tfvars` con secretos. |
