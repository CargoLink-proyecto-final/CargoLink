# Deployment

Recomendaciones y caveats para correr CargoLink en producción. El stack hoy es opinionado pero no incluye un setup productivo completo — esta página marca qué falta resolver antes de un release real.

## Estado actual

| Pieza | Estado |
|---|---|
| Build & push de imágenes a GHCR | ✅ automatizado en GitHub Actions (ver [`ci-cd.md`](./ci-cd.md)) |
| `docker-compose.yml` para dev | ✅ |
| `docker-compose.prod.yml` | ❌ no existe — pendiente |
| Healthcheck de backend | ❌ no hay (solo postgres) |
| Backup automático de DB | ❌ no hay |
| Migraciones en deploy | ✅ corren en el `docker-entrypoint.sh` |
| Rollback automático | ❌ manual |
| Smoke test post-deploy | ❌ manual |
| Logs centralizados | ❌ pendiente |
| Métricas | ❌ pendiente |
| HTTPS / TLS | depende del orquestador (no resuelto en el repo) |

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

## Levantar el stack productivo con las imágenes de GHCR

Mientras no hay un `docker-compose.prod.yml` versionado, este es un compose mínimo que sirve de referencia:

```yaml
# docker-compose.prod.yml (no versionado todavía)
services:
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      retries: 5

  backend:
    image: ghcr.io/<owner>/cargolink-backend:prod
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRATION: ${JWT_EXPIRATION}
      CORS_ORIGIN: ${CORS_ORIGIN}
      FRONTEND_URL: ${FRONTEND_URL}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_SECURE: ${SMTP_SECURE}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASSWORD: ${SMTP_PASSWORD}
      SMTP_FROM: ${SMTP_FROM}
    ports:
      - "8030:3001"     # ajustar según tag (prod=8030, dev=8035)

  frontend:
    image: ghcr.io/<owner>/cargolink-frontend:prod
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "3030:3000"     # ajustar según tag

volumes:
  pgdata:
```

Login + pull + up:

```bash
echo $GHCR_PAT | docker login ghcr.io -u <username> --password-stdin
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

⚠️ El `NEXT_PUBLIC_API_URL` de la imagen `cargolink-frontend:prod` está bakeado al valor que se le pasó en el build de CI. Hoy ese build no recibe el arg en el workflow → usa el default del Dockerfile (`http://localhost:3001/api`), que **no sirve en producción**. Tres opciones:

1. Buildear el frontend en el server (`docker compose build frontend` con compose local + build args).
2. Modificar el workflow para que reciba `NEXT_PUBLIC_API_URL` como build-arg desde un secret de GitHub.
3. Servir el frontend en el mismo dominio que el backend con un reverse proxy (`/api/*` → backend, `/*` → frontend) y hardcodear `NEXT_PUBLIC_API_URL=/api` (relativo) — la opción menos invasiva.

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

No automatizado. Estrategia recomendada para una falla de deploy:

```bash
# 1. Identificar el tag previo (commit anterior en la rama)
PREV=$(git log --oneline -2 main | tail -1 | cut -d' ' -f1)

# 2. Pull de la imagen vieja
docker pull ghcr.io/<owner>/cargolink-backend:main-${PREV:0:7}

# 3. Tag como prod
docker tag ghcr.io/<owner>/cargolink-backend:main-${PREV:0:7} ghcr.io/<owner>/cargolink-backend:prod

# 4. Recreate
docker compose -f docker-compose.prod.yml up -d --force-recreate backend
```

⚠️ El rollback de la imagen **no revierte la migración** que pudo haber aplicado el deploy nuevo. Si la migración rompió algo, hay que:
1. Restaurar el backup pre-deploy.
2. **Después** rollbackear la imagen.

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
