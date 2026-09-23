# Primeros pasos

Cómo levantar CargoLink en tu máquina. Dos caminos: Docker Compose (todo en un comando) o dev local (mejor para iterar rápido en un solo servicio).

## Prerequisitos

| Camino | Requisitos |
|---|---|
| Docker Compose | [Docker](https://docs.docker.com/get-docker/) v20+ con Docker Compose v2 (incluido en Docker Desktop). |
| Dev local | Node.js 20+, npm, PostgreSQL 15+ corriendo localmente o accesible vía DSN. Para mobile: [Expo Go](https://expo.dev/client) instalado en tu teléfono o un emulador iOS/Android. |

Recomendamos Docker para arrancar y probar la primera vez. Dev local cuando ya conozcas la app y quieras un loop de desarrollo más rápido sobre un servicio en particular.

## Opción A — Docker Compose

Levanta postgres, backend y frontend con migraciones y seed automáticos.

### 1. Configurar variables de entorno

```bash
cp .env.example .env
```

Editá `.env`. **Mínimo a cambiar** para arrancar:

```env
POSTGRES_PASSWORD=<algo-seguro>
JWT_SECRET=<string-largo-y-aleatorio>
```

Las demás vars (`POSTGRES_USER`, `POSTGRES_DB`, `JWT_EXPIRATION`, `CORS_ORIGIN`, `FRONTEND_URL`, `UPLOAD_DIR`) tienen defaults razonables para dev. El bloque SMTP podés dejarlo vacío — el backend usa Ethereal Email automáticamente como fallback de dev (no envía emails reales, solo loguea URLs de preview). Detalle completo de variables en [`docker.md`](./docker.md).

### 2. Levantar el stack

```bash
docker compose up -d
```

Lo que va a pasar:

1. Pull de `postgres:15-alpine`.
2. Build de las imágenes `backend` y `frontend` con sus Dockerfiles multi-stage.
3. PostgreSQL arranca; el backend espera el healthcheck (`pg_isready`).
4. El backend ejecuta `prisma migrate deploy` (aplica las 6 migraciones del repo).
5. El backend corre el seed (`dist/prisma/seed.js`) — idempotente vía `upsert`.
6. Backend levanta en `:3001`, frontend en `:3000`.

### 3. Verificar

```bash
docker compose ps
docker compose logs backend
docker compose logs frontend
```

Endpoints a abrir:

| URL | Qué es |
|---|---|
| http://localhost:3000 | Frontend Next.js |
| http://localhost:3001/api | API REST (raíz) |
| http://localhost:3001/api/docs | Swagger UI con todos los endpoints |
| localhost:5432 | PostgreSQL (user/pass de `.env`) |

### 4. Cuentas demo

Todas con password `password123`, **salvo el admin** (ver nota abajo):

| Email | Rol | Nombre | Notas |
|---|---|---|---|
| `admin@cargolink.com` | `ADMIN` | Admin CargoLink | password vía `ADMIN_PASSWORD` |
| `shipper@example.com` | `CARGO_GENERATOR` | Juan García | Logística Sur S.A. |
| `carrier@example.com` | `TRANSPORTER` | Carlos Martínez | transportista independiente |
| `empresa@example.com` | `COMPANY_ADMIN` | Laura Fernández | dueña de la empresa "Flota Andina" |
| `driver1@example.com` | `TRANSPORTER` | Pedro Gómez | chofer de Flota Andina |
| `driver2@example.com` | `TRANSPORTER` | Sofía Ramírez | chofer de Flota Andina |
| `driver3@example.com` | `TRANSPORTER` | Diego López | con solicitud `PENDING` a Flota Andina |
| `profe1@cargolink.com` | `TRANSPORTER` | Profe 1 | independiente |
| `profe2@cargolink.com` | `TRANSPORTER` | Profe 2 | independiente |
| `profe3@cargolink.com` | `TRANSPORTER` | Profe 3 | independiente |
| `transportista1@cargolink.com` | `TRANSPORTER` | Transportista 1 | independiente |
| `transportista2@cargolink.com` | `TRANSPORTER` | Transportista 2 | independiente |

La password del admin sale de `ADMIN_PASSWORD` (ver `.env.example`). Si la
seteás, el seed la reescribe en cada arranque y pasa a ser la fuente de verdad:
cambiarla desde la app no persiste al siguiente restart. Si no la seteás, el seed
usa su fallback solo al crear la cuenta y respeta cualquier cambio posterior.

El seed también crea la empresa demo "Flota Andina" (con 2 choferes y 1 solicitud pendiente) y un load demo "Electrónica a Córdoba" asociado al shipper. Es idempotente: si se corrió antes, reutiliza lo existente y no duplica. Detalle del seed en [`base-de-datos.md`](./base-de-datos.md); del flujo de empresas en [`empresas.md`](./empresas.md).

### 5. Re-seed y reset

```bash
# Volver a correr el seed (idempotente para users, no duplica si ya existen)
docker compose exec backend node dist/prisma/seed.js

# Reset total — borra el volumen pgdata y arranca con DB virgen
docker compose down -v
docker compose up -d
```

### 6. Comandos útiles

```bash
docker compose logs -f backend          # logs en tiempo real
docker compose exec backend sh          # shell dentro del contenedor backend
docker compose exec postgres psql -U postgres cargolink  # psql contra la DB
docker compose up -d --build            # rebuild de imágenes (después de cambios)
docker compose down                     # parar todo (mantiene el volumen)
```

Más comandos y explicación de cada servicio en [`docker.md`](./docker.md).

## Opción B — Dev local sin Docker

### Backend

```bash
cd backend
cp .env.example .env
# Editá .env y poné DATABASE_URL apuntando a tu Postgres local

npm install
npx prisma generate
npx prisma migrate dev --name init     # primera vez, o cuando hay migraciones nuevas
npm run prisma:seed                    # cuentas demo
npm run start:dev                      # http://localhost:3001 con watch
```

Swagger en http://localhost:3001/api/docs.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
```

Importante: el `.env.example` del frontend tiene `NEXT_PUBLIC_API_URL=http://localhost:3002/api` (valor heredado, no coincide con el backend default). Cambialo a:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

Luego:

```bash
npm run dev    # http://localhost:3003 con watch
```

Notar que `npm run dev` levanta en **3003** (definido en `package.json`), no en 3000. Con Docker Compose la imagen runtime sí escucha en 3000.

### Mobile

```bash
cd mobile
npm install
npx expo start    # imprime un QR para Expo Go
```

Detalles, opciones de emulador y permisos en [`mobile.md`](./mobile.md). Importante: hoy la URL de la API está hardcodeada como `http://localhost:3002/api` en `src/services/api.ts`, lo cual no coincide con el backend default (3001). Si vas a probar mobile contra un backend local real, **editá ese valor a la IP de tu máquina** (no `localhost` desde el dispositivo) y al puerto correcto (3001).

## Troubleshooting

### Puerto ocupado al hacer `docker compose up`

```
Error response from daemon: Ports are not available: ... :3000: bind: address already in use
```

Algo más está usando 3000 / 3001 / 5432. Encontralo y cerralo:

```bash
lsof -i :3000        # ver qué proceso está en el puerto
```

O cambiá el mapping en `docker-compose.yml` (lado izquierdo del `:`, el del host).

### "Set POSTGRES_PASSWORD in .env" o "JWT_SECRET" al arrancar

`docker-compose.yml` declara esas vars como `:?` (required). Si la dejaste vacía, Compose corta. Volvé a [paso 1](#1-configurar-variables-de-entorno) y completalas.

### El backend reinicia en loop

Mirá `docker compose logs backend`. Las dos causas típicas son:

- **Postgres no está healthy todavía**: el backend depende de `service_healthy`, así que esto sería raro — pero si el contenedor de Postgres murió por algo (p.ej. password mal seteada), el backend va a esperar para siempre. Mirar `docker compose logs postgres`.
- **Migración falla**: hay un schema legacy en el volumen. Si estás en dev y no te importan los datos, `docker compose down -v` resuelve.

### El frontend muestra "Network Error" o 401 en todo

Casi siempre es `NEXT_PUBLIC_API_URL` mal apuntado. Verificá:

- Con Docker: el build arg en `docker-compose.yml` está fijo a `http://localhost:3001/api` (correcto).
- Local: tu `.env.local` apunta a `http://localhost:3001/api`, no al 3002 del `.env.example` stale.

### Las migraciones fallan en `prisma migrate dev`

Generalmente porque hay drift entre el schema y el estado real de la DB. Para dev local con datos descartables:

```bash
cd backend
npx prisma migrate reset    # cuidado: borra todo y re-aplica desde cero
```

### "Cannot find module 'bcrypt'" o similar tras pull nuevo

Dependencias nuevas. Re-instalá:

```bash
cd backend && npm install
cd frontend && npm install
cd mobile && npm install
```

Con Docker: `docker compose build --no-cache backend` o `frontend`.
