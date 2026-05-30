# Docker

Cómo está orquestado el stack y cómo se buildean las imágenes. Si solo querés correr la app, [`primeros-pasos.md`](./primeros-pasos.md) alcanza — este documento es para entender o tocar la infraestructura.

## `docker-compose.yml`

Tres servicios en una red default. Archivo fuente: [`../docker-compose.yml`](../docker-compose.yml).

### Servicio `postgres`

| Aspecto | Valor |
|---|---|
| Imagen | `postgres:15-alpine` |
| Restart | `unless-stopped` |
| Puerto host:container | `5432:5432` |
| Volumen | `pgdata:/var/lib/postgresql/data` (named volume) |
| Healthcheck | `pg_isready -U postgres` cada 5s, timeout 3s, 5 retries |
| Env vars | `POSTGRES_USER` (default `postgres`), `POSTGRES_PASSWORD` (requerido), `POSTGRES_DB` (default `cargolink`) |

El volumen `pgdata` persiste entre `docker compose down` (no entre `down -v`).

### Servicio `backend`

| Aspecto | Valor |
|---|---|
| Build context | `./backend` |
| Restart | `unless-stopped` |
| Puerto host:container | `3001:3001` |
| `depends_on` | `postgres` con `condition: service_healthy` |

Variables de entorno inyectadas al contenedor:

| Variable | Valor en compose | Default si no está en `.env` |
|---|---|---|
| `DATABASE_URL` | `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public` | construida |
| `JWT_SECRET` | `${JWT_SECRET}` | **requerido**, falla si vacío |
| `JWT_EXPIRATION` | `${JWT_EXPIRATION:-7d}` | `7d` |
| `PORT` | `3001` | hardcoded |
| `CORS_ORIGIN` | `${CORS_ORIGIN:-http://localhost:3000}` | `http://localhost:3000` |
| `FRONTEND_URL` | `${FRONTEND_URL:-http://localhost:3000}` | `http://localhost:3000` |
| `SMTP_HOST` | `${SMTP_HOST:-}` | vacío → Ethereal fallback |
| `SMTP_PORT` | `${SMTP_PORT:-587}` | `587` |
| `SMTP_SECURE` | `${SMTP_SECURE:-false}` | `false` |
| `SMTP_USER` | `${SMTP_USER:-}` | vacío |
| `SMTP_PASSWORD` | `${SMTP_PASSWORD:-}` | vacío |
| `SMTP_FROM` | `${SMTP_FROM:-}` | vacío → `CargoLink <no-reply@cargolink.local>` (hardcoded en `MailService`) |

`POSTGRES_PASSWORD` y `JWT_SECRET` están marcados con `:?` — Compose aborta si están vacíos.

### Servicio `frontend`

| Aspecto | Valor |
|---|---|
| Build context | `./frontend` |
| Build arg | `NEXT_PUBLIC_API_URL=http://localhost:3001/api` |
| Restart | `unless-stopped` |
| Puerto host:container | `3000:3000` |
| `depends_on` | `backend` (sin healthcheck) |

`NEXT_PUBLIC_API_URL` se inyecta como build arg, no como env var de runtime — Next.js lo bake-ea en el bundle al `next build`. Para cambiarlo en otro entorno hay que rebuild.

### Volúmenes

```yaml
volumes:
  pgdata:
```

Named volume manejado por Docker. Ubicación física en el host depende del driver (en Mac/Windows está dentro de la VM de Docker Desktop).

## Backend Dockerfile

Archivo fuente: [`../backend/Dockerfile`](../backend/Dockerfile). Multi-stage de 3 fases sobre `node:20-alpine`.

### Stage 1 — `deps`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
```

Instala todas las deps (incluyendo dev) para que el build pueda compilar TS.

### Stage 2 — `build`

```dockerfile
FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npx ts-node --compiler-options '{"module":"commonjs"}' -e "void 0" && \
    npx tsc prisma/seed.ts --outDir dist/prisma --esModuleInterop --resolveJsonModule --skipLibCheck
```

- `openssl` lo necesita Prisma para su query engine.
- `prisma generate` crea el cliente tipado bajo `node_modules/@prisma/client`.
- `npm run build` corre `nest build` → `dist/`.
- Última línea: compila el `seed.ts` aparte porque `nest build` no lo agarra (vive bajo `prisma/`, no `src/`). El `ts-node ... -e "void 0"` es un truco para que el resolver de ts-node ya esté listo antes de invocar `tsc`.

### Stage 3 — `runner`

```dockerfile
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh ./
EXPOSE 3001
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
```

Imagen final con solo lo necesario para correr — `dist/`, `node_modules/`, schema Prisma y el entrypoint. Sin source `.ts`.

### `docker-entrypoint.sh`

Archivo fuente: [`../backend/docker-entrypoint.sh`](../backend/docker-entrypoint.sh).

```bash
#!/bin/sh
set -e

echo "Running migrations..."
npx prisma migrate deploy

echo "Seeding database..."
node dist/prisma/seed.js || echo "Seed skipped (may already exist)"

echo "Starting server..."
exec node dist/src/main
```

Pasos:

1. `prisma migrate deploy` aplica las migraciones pendientes. Idempotente.
2. Seed con manejo permisivo de error — si falla (p.ej. data ya existe y un `create` que no es upsert choca), loguea y sigue. El seed es mayormente upsert + un `findFirst` antes del `create` del load, así que en práctica esto es cinturón y tirantes.
3. `exec node dist/src/main` arranca el server. `exec` reemplaza el proceso de shell por Node, así PID 1 termina siendo el servidor — importante para que los signals (SIGTERM) lleguen correctamente.

## Frontend Dockerfile

Archivo fuente: [`../frontend/Dockerfile`](../frontend/Dockerfile). Multi-stage de 3 fases sobre `node:20-alpine`.

### Stage 1 — `deps`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
```

Idéntico patrón al backend.

### Stage 2 — `build`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build
```

El `ARG` recibe el valor del compose. Se promueve a `ENV` para que el `next build` lo bake-ee dentro del bundle. Default a `localhost:3001/api` si no se pasa.

### Stage 3 — `runner`

```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

`next.config.js` tiene `output: 'standalone'`, lo que genera un mini-server self-contained en `.next/standalone/server.js`. Sólo copiamos eso + los assets estáticos. La imagen final es chica.

## Tabla consolidada de variables de entorno

| Variable | Servicio | Requerida | Default | Para qué |
|---|---|---|---|---|
| `POSTGRES_USER` | postgres | No | `postgres` | Usuario admin de la DB |
| `POSTGRES_PASSWORD` | postgres + backend | **Sí** | — | Password de la DB |
| `POSTGRES_DB` | postgres + backend | No | `cargolink` | Nombre de la DB |
| `DATABASE_URL` | backend | Sí (construida) | de las 3 anteriores | Connection string para Prisma |
| `JWT_SECRET` | backend | **Sí** | — | Secret para firmar JWTs |
| `JWT_EXPIRATION` | backend | No | `7d` | Lifetime de los tokens |
| `PORT` | backend | No | `3001` | Puerto del server |
| `CORS_ORIGIN` | backend | No | `http://localhost:3000` | Origen permitido por CORS |
| `FRONTEND_URL` | backend | No | `http://localhost:3000` | Base de los links en emails (verify, reset) |
| `SMTP_HOST` | backend | No | vacío | Host SMTP; vacío activa Ethereal |
| `SMTP_PORT` | backend | No | `587` | Puerto SMTP |
| `SMTP_SECURE` | backend | No | `false` | `true` si el server usa TLS implícito |
| `SMTP_USER` | backend | No | vacío | Usuario SMTP; **si `SMTP_HOST` está set pero `SMTP_USER` vacío, también cae a Ethereal** |
| `SMTP_PASSWORD` | backend | No | vacío | Password SMTP |
| `SMTP_FROM` | backend | No | `CargoLink <no-reply@cargolink.local>` | Header From |
| `NEXT_PUBLIC_API_URL` | frontend (build) | No | `http://localhost:3001/api` | Base URL que el bundle JS usa para llamar al backend |

## Comandos comunes

```bash
# Levantar / parar
docker compose up -d
docker compose down
docker compose down -v          # ⚠️ borra el volumen pgdata

# Build después de cambios
docker compose build backend
docker compose up -d --build

# Logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs postgres

# Shells / exec
docker compose exec backend sh
docker compose exec postgres psql -U postgres cargolink
docker compose exec backend npx prisma migrate deploy
docker compose exec backend node dist/prisma/seed.js
docker compose exec backend npx prisma studio  # abre en http://localhost:5555 (ojo: NO está expuesto en compose)

# Estado
docker compose ps
docker compose top backend      # procesos dentro
```

## Diagrama de startup

```
docker compose up -d
       │
       ▼
  postgres pulled (si no está)
       │
       ▼
  postgres start
       │  healthcheck pg_isready (5s loop, hasta 5 retries)
       ▼  ✅
  backend build (si no hay caché)
       │  deps → build → runner
       ▼
  backend start  (entrypoint)
       ├─ 1. prisma migrate deploy
       ├─ 2. node dist/prisma/seed.js (best-effort)
       └─ 3. exec node dist/src/main → :3001
       │
       ▼
  frontend build (si no hay caché)
       │  deps → build (NEXT_PUBLIC_API_URL baked) → runner
       ▼
  frontend start
       └─ node server.js → :3000
```

## Caveats y cosas a saber

- **No hay volúmenes de código bind-mounteados en compose**. Los Dockerfiles copian el código al build; un cambio en `backend/src/*.ts` requiere `docker compose up -d --build backend`. Para iteración rápida usar dev local (ver [`primeros-pasos.md`](./primeros-pasos.md) opción B).
- **No hay healthcheck del backend**. `depends_on` del frontend es simple, no espera `service_healthy`. Si el backend tarda en arrancar (p.ej. migración pesada), el frontend ya está sirviendo pero sus llamadas van a fallar con `ECONNREFUSED` los primeros segundos.
- **Sin backup automático de la DB en compose**. Es desarrollo, los datos son descartables. Para prod ver [`deployment.md`](./deployment.md).
- **Prisma Studio no está expuesto**. Si lo abrís con `docker compose exec backend npx prisma studio`, escucha en `0.0.0.0:5555` dentro del contenedor pero no hay port mapping. Para usarlo, agregalo a `docker-compose.yml` temporalmente o corré `npx prisma studio` desde el host con `DATABASE_URL` apuntando a `localhost:5432`.
- **Puerto del frontend en dev local vs Docker**. `npm run dev` levanta en **3003** (definido en `frontend/package.json`); la imagen runtime escucha en **3000**. Es intencional para que las dos cosas puedan correr juntas si querés.

## CI/CD relacionado

Las imágenes para deploy se buildean en GitHub Actions (no en Compose local), se publican a Artifact Registry y se deployan a Cloud Run: entorno `dev` (push a `develop`) y `prod` (push a `main`). Detalle en [`ci-cd.md`](./ci-cd.md).
