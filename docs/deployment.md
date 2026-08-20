# Deployment

CargoLink se despliega en **Google Cloud Run + Cloud SQL** (dos entornos: dev y prod), con deploy continuo desde GitHub Actions.

> **La fuente de verdad del deploy es [`../infra/gcp/README.md`](../infra/gcp/README.md)** (Terraform + guía paso a paso) y [`ci-cd.md`](./ci-cd.md) (el pipeline). Esta página queda como referencia conceptual (variables, migraciones, backups, rollback, alternativas de hosting).

## Estado actual

| Pieza | Estado |
|---|---|
| Infra como código (Terraform) | ✅ `infra/gcp/` — Cloud Run + Cloud SQL + Secret Manager |
| Build & push de imágenes a Artifact Registry | ✅ automatizado en GitHub Actions (ver [`ci-cd.md`](./ci-cd.md)) |
| Deploy continuo a Cloud Run | ✅ merge a `develop`→dev, `main`→prod (keyless vía WIF) |
| Dos entornos (dev / prod) con DB separada | ✅ `cargolink-*` (prod) / `cargolink-dev-*` (dev) |
| `docker-compose.yml` para dev local | ✅ |
| Migraciones en deploy | ✅ corren en el `docker-entrypoint.sh` al startup |
| Backup automático de DB pre-deploy | ❌ manual (Cloud SQL tiene backups diarios automáticos) |
| Rollback | ⚠️ manual — `gcloud run services update-traffic` a revisión previa (ver [`ci-cd.md`](./ci-cd.md)) |
| Smoke test post-deploy | ❌ manual |
| Logs / métricas | Cloud Logging / Cloud Monitoring (built-in de Cloud Run) |
| HTTPS / TLS | ✅ automático en las URLs `*.run.app` de Cloud Run |

## Estrategias de hosting

Tres opciones razonables según escala:

### Single VPS (más simple)

Un solo servidor (DigitalOcean, Hetzner, Vultr, etc.) con Docker. Compose con los tres servicios + nginx/Caddy como reverse proxy con TLS.

Pros: barato, control total, simple de razonar. Contras: single point of failure, escalado horizontal manual.

### Managed services (recomendado para crecer)

| Componente | Servicios |
|---|---|
| Frontend (Next.js) | [Vercel](https://vercel.com) o [Netlify](https://www.netlify.com) |
| Backend (NestJS) | [Railway](https://railway.app), [Render](https://render.com), [Fly.io](https://fly.io) |
| Base de datos | [Supabase](https://supabase.com), Railway PostgreSQL, [Neon](https://neon.tech) |

Pros: cero ops, autoescalado, backups automáticos en el plan pago. Contras: costo crece con tráfico, lock-in moderado.

### Cloud propio (más control)

AWS ECS / Fargate, GCP Cloud Run, Azure Container Apps para los servicios; RDS / Cloud SQL / Azure DB para Postgres.

Pros: ergonómico a gran escala, integra con IAM. Contras: complejidad, billing menos predecible.

## Variables de entorno de producción

Las mismas vars que dev (ver [`docker.md`](./docker.md)) pero con valores reales. Lo crítico:

| Var | Recomendación prod |
|---|---|
| `POSTGRES_PASSWORD` | Generada con un password manager o `openssl rand -base64 32`. Distinta a la de dev. |
| `JWT_SECRET` | `openssl rand -base64 64`. **Nunca** el default `'default-secret'`. |
| `JWT_EXPIRATION` | `7d` está OK; si querés sesiones más cortas, `24h`. Considerar sumar refresh tokens. |
| `CORS_ORIGIN` | URL real del frontend, **no** `*`. Múltiples orígenes: separar por coma y parsear en `main.ts` (hoy soporta solo uno). |
| `FRONTEND_URL` | URL real (la usan los emails de verify/reset). |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | Cuenta real. Ethereal fallback **no envía** emails. |
| `SMTP_FROM` | Email verificado en el dominio (SPF/DKIM configurados). |
| `NEXT_PUBLIC_API_URL` | Build-arg, no env-var de runtime. Se bakea en el build. |

### Cómo no commitear secretos

- `.gitignore` ya cubre `.env*`. **Nunca** hacer `git add -f .env`.
- Para deploy a managed services: settear vars desde la UI del provider o vía CLI (`vercel env`, `railway variables set`, `flyctl secrets set`).
- Para deploy a VPS: dejar `.env` en el server (fuera del repo); editarlo a mano o vía un secret manager (Vault, Doppler, etc.).
- Si un secret se commitea por accidente: **rotalo** (no alcanza con borrar el commit), y limpialo del historial con `git filter-repo` o `bfg-repo-cleaner`.

## Cómo se despliega hoy (GCP Cloud Run)

El deploy real es **Google Cloud Run + Cloud SQL**, provisionado con Terraform y actualizado por CI. El detalle completo (Terraform, dos entornos, Workload Identity Federation, deploy en 2 fases) está en [`../infra/gcp/README.md`](../infra/gcp/README.md); el pipeline en [`ci-cd.md`](./ci-cd.md). Resumen:

- **Imágenes** → Artifact Registry (`cargolink` para prod, `cargolink-dev` para dev), no GHCR.
- **Backend** → Cloud Run, conecta a Cloud SQL por socket unix; `DATABASE_URL`, `JWT_SECRET`, `SMTP_PASSWORD` y `ADMIN_PASSWORD` desde Secret Manager; el resto de SMTP/CORS/FRONTEND_URL como env vars que setea Terraform.
- **Frontend** → Cloud Run; `NEXT_PUBLIC_API_URL` se hornea en el build de CI resolviendo en vivo la URL del backend del entorno (resuelve el problema del bake — ya no usa el default `localhost`).
- **Deploy continuo**: merge a `develop` → dev, merge a `main` → prod. TLS automático en las URLs `*.run.app`.

> El `docker-compose.yml` de la raíz es solo para **dev local** (ver [`docker.md`](./docker.md)), no para producción.

## Migraciones en el deploy

Las migraciones se aplican automáticamente al startup del backend (`docker-entrypoint.sh` corre `prisma migrate deploy` antes de levantar el server).

**Implicaciones**:
- Todo lo que esté en `prisma/migrations/` se aplica sin intervención manual al primer arranque después del deploy.
- Una migración pesada (rebuild de tabla, índice grande) **bloquea el arranque del backend**. Si tardás mucho, el orquestador puede declarar el container unhealthy y reciclarlo, generando un loop.
- **No hay backup automático antes de la migración**.

### Recomendaciones

- Para migraciones 🟢 (agregar columna opcional, índice no único, tabla nueva): aplicar normalmente.
- Para migraciones 🟡 (rename, índice único nuevo, cambio de tipo): hacer backup manual antes del deploy.
- Para migraciones 🔴 (drop columna, drop tabla, cambios de FK que requieren backfill): backup + probar restore en un entorno paralelo + considerar deploy en dos pasos (1: dejar de leer la columna; 2: drop). Es el flujo "expand & contract".

## Backup de la DB

**No automatizado en el repo.** Es la mayor brecha del setup productivo.

### Backup manual

```bash
# desde el server (con compose)
docker compose exec postgres pg_dump -U postgres -Fc cargolink > backup-$(date +%F-%H%M).dump

# desde otra máquina con pg_dump instalado
PGPASSWORD=$POSTGRES_PASSWORD pg_dump -h <server-ip> -U postgres -Fc cargolink > backup.dump
```

`-Fc` es el formato custom (binario, comprimido, restaurable selectivamente con `pg_restore`).

### Backup automático (sugerido)

Un cron del host que corra `pg_dump` y suba a S3 / Backblaze / similar, con retención (últimos 7 diarios + 4 semanales + 12 mensuales). Ejemplo con `docker run --rm` + un script:

```bash
0 2 * * * /usr/local/bin/cargolink-backup.sh
```

Algunos managed services (Supabase, Railway, Neon) lo hacen out-of-the-box — vale evaluarlos por esa razón sola.

## Restore

```bash
# Stop backend para que nadie escriba durante el restore
docker compose stop backend

# Restore
docker compose exec -T postgres pg_restore -U postgres -d cargolink --clean --if-exists < backup-2026-05-23.dump

# Start
docker compose start backend
```

## Healthchecks

### Backend

**No tiene healthcheck en el repo.** El frontend depende `depends_on: backend` sin condición, así que el frontend arranca aunque el backend esté caído.

Para sumar uno (recomendado para prod):

```yaml
# en docker-compose.prod.yml, servicio backend:
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:3001/api/docs"]
  interval: 10s
  timeout: 3s
  retries: 5
  start_period: 30s
```

Mejor todavía: agregar un endpoint dedicado `/api/health` en `main.ts` que verifique la DB con `prisma.$queryRaw('SELECT 1')`. Hoy no existe.

### Postgres

Ya configurado: `pg_isready -U postgres` cada 5s.

### Frontend

No tiene; `next start` no expone un endpoint dedicado. Un check de `/` con expected 200 alcanza.

## Smoke test post-deploy

Manual hoy. Mínimo a verificar:

1. `curl https://<api-url>/api/docs` responde 200.
2. `POST /api/auth/login` con la cuenta admin devuelve un token.
3. `GET /api/users/me` con el token devuelve el user.
4. `GET /api/loads/available` responde una lista.
5. El frontend carga, login funciona, dashboard se ve correctamente.

Automatizable con un script Bash + `curl + jq` o con [`hurl`](https://hurl.dev/).

## Rollback

Cloud Run versiona cada deploy como una revisión. Rollback instantáneo (sin rebuild) mandando el tráfico a la revisión previa:

```bash
# Listar revisiones
gcloud run revisions list --service=cargolink-backend --region=southamerica-east1

# 100% del tráfico a una revisión anterior
gcloud run services update-traffic cargolink-backend \
  --region=southamerica-east1 --to-revisions=<REVISION-PREVIA>=100
```

(Para dev, usar `cargolink-dev-backend`.) Alternativa: re-deployar una imagen anterior por SHA desde Artifact Registry — ver [`ci-cd.md`](./ci-cd.md) § Rollback.

⚠️ El rollback de la imagen/revisión **no revierte la migración** que pudo haber aplicado el deploy nuevo. Si la migración rompió algo, hay que:
1. Restaurar el backup pre-deploy.
2. **Después** rollbackear la imagen/revisión.

Por eso el backup pre-migración es crítico.

## Logs

Hoy: solo stdout/stderr de los containers (`docker compose logs`).

Para producción real:
- Forward a CloudWatch / Loki / Papertrail / Datadog / etc. mediante el log driver de Docker (`--log-driver=loki`, p.ej.).
- Estructurar los logs en JSON (NestJS soporta `Logger` con `nest-winston` o similar) para que sean queryables.

## Métricas

No hay. Lo mínimo a agregar:

- `/metrics` con Prometheus client para el backend (latencia por endpoint, count de errores, etc.).
- Scrape desde Prometheus + Grafana, o un managed como New Relic.

## Reverse proxy / TLS

No incluido en el repo. Para single VPS:

- [Caddy](https://caddyserver.com) es la opción simple — TLS automático con Let's Encrypt, archivo de config legible:
  ```caddy
  cargolink.com {
    reverse_proxy frontend:3000
  }
  api.cargolink.com {
    reverse_proxy backend:3001
  }
  ```
- nginx con `certbot` es la otra opción más tradicional.
- Detrás de un managed (Vercel, Railway), el TLS lo provee el servicio.

## Checklist antes de un release a prod

- [ ] `JWT_SECRET` rotado, distinto a dev.
- [ ] `admin_password` seteado en las tfvars de prod. Si queda vacío, el seed crea
      `admin@cargolink.com` con un fallback que está versionado en el repo.
- [ ] `POSTGRES_PASSWORD` rotado, distinto a dev.
- [ ] SMTP real configurado y verificado con un email de prueba.
- [ ] `CORS_ORIGIN` apunta al dominio real del frontend.
- [ ] `FRONTEND_URL` apunta al dominio real.
- [ ] `NEXT_PUBLIC_API_URL` baked correctamente en la imagen del frontend.
- [ ] HTTPS habilitado en el frontend y el backend.
- [ ] Backup de DB tomado pre-deploy.
- [ ] Migraciones revisadas — riesgos clasificados.
- [ ] Plan de rollback definido.
- [ ] Smoke test pasa post-deploy.

Para el flujo formal de release, ver [`contribuir.md`](./contribuir.md) sección "Flujo de release".
