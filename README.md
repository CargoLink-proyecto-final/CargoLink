# CargoLink

Plataforma digital de gestión de transporte de carga por carretera que conecta dadores de carga (shippers) con transportistas (carriers).

## Stack

| Capa | Tecnología |
|---|---|
| Mobile | React Native + Expo (SDK 50) + TypeScript |
| Web | Next.js 14 (App Router) + React 18 + TypeScript + Tailwind |
| Backend | NestJS 10 + Prisma 5 + JWT + Socket.IO |
| Base de datos | PostgreSQL 15 |
| Mapas | Leaflet (web), react-native-maps (mobile) |
| Chat | WebSockets (Socket.IO) |

## Roles

- **Shipper** (`CARGO_GENERATOR`) — publica loads, recibe postulaciones, sigue el viaje, califica al carrier.
- **Carrier** (`TRANSPORTER`) — ve loads disponibles, se postula, maneja trips, reporta GPS, califica al shipper.
- **Company Admin** (`COMPANY_ADMIN`) — administra una flota: aprueba choferes, ve trips y métricas de la empresa.
- **Admin** (`ADMIN`) — vista global, asigna manualmente, exporta el registro, gestiona usuarios.

## Quick start (Docker Compose)

```bash
cp .env.example .env
# Editar .env: setear POSTGRES_PASSWORD y JWT_SECRET (requeridos)

docker compose up -d
```

Endpoints:

- Frontend: http://localhost:3000
- API REST: http://localhost:3001/api
- Swagger: http://localhost:3001/api/docs
- PostgreSQL: localhost:5432

Cuentas demo (password `password123`, salvo el admin):

| Email | Rol |
|---|---|
| `admin@cargolink.com` | ADMIN — password aparte, ver abajo |
| `shipper@example.com` | CARGO_GENERATOR |
| `carrier@example.com` | TRANSPORTER |
| `empresa@example.com` | COMPANY_ADMIN |
| `profe1@cargolink.com` … `profe3@cargolink.com` | TRANSPORTER |
| `transportista1@cargolink.com`, `transportista2@cargolink.com` | TRANSPORTER |

La password del admin sale de la env var `ADMIN_PASSWORD`; si no la seteás, el
seed usa un fallback (ver `.env.example`). Con la variable seteada, el seed la
reescribe en cada arranque — es la fuente de verdad de esa credencial. Sin la
variable, solo se aplica al crear la cuenta y el seed no pisa una password ya
cambiada.

Para dev local sin Docker, mobile, o cualquier detalle más allá del happy path: [`docs/primeros-pasos.md`](./docs/primeros-pasos.md).

## Documentación

Toda la documentación técnica vive bajo [`docs/`](./docs/). Índice en [`docs/README.md`](./docs/README.md). Para un mapa general de dónde está todo, arrancá por [`docs/resumen.md`](./docs/resumen.md).

| Documento | Cubre |
|---|---|
| [`resumen.md`](./docs/resumen.md) | Mapa general del repo: estructura, dónde vive cada feature, índice. |
| [`arquitectura.md`](./docs/arquitectura.md) | Overview técnico, diagrama, flujo end-to-end. |
| [`arquitectura-gcp.md`](./docs/arquitectura-gcp.md) | Arquitectura física en GCP. |
| [`primeros-pasos.md`](./docs/primeros-pasos.md) | Setup Docker + dev local, troubleshooting. |
| [`docker.md`](./docs/docker.md) | Compose, Dockerfiles, env vars. |
| [`backend.md`](./docs/backend.md) | NestJS: módulos, guards, mail service. |
| [`api.md`](./docs/api.md) | Referencia REST completa. |
| [`empresas.md`](./docs/empresas.md) | Flotas multi-conductor (`COMPANY_ADMIN`). |
| [`websockets.md`](./docs/websockets.md) | Socket.IO `/chat`. |
| [`base-de-datos.md`](./docs/base-de-datos.md) | Prisma schema, migraciones, seed. |
| [`autenticacion.md`](./docs/autenticacion.md) | JWT, guards, roles, password reset. |
| [`frontend.md`](./docs/frontend.md) | Next.js, componentes, estado. |
| [`mobile.md`](./docs/mobile.md) | Expo, screens, GPS, push. |
| [`ci-cd.md`](./docs/ci-cd.md) | GitHub Actions → Cloud Run. |
| [`deployment.md`](./docs/deployment.md) | Producción, backups, rollback. |
| [`workflow-claude-code.md`](./docs/workflow-claude-code.md) | `.claude/` tooling. |
| [`contribuir.md`](./docs/contribuir.md) | Branches, commits, PRs, secretos. |

## Workflow para colaborar

Reglas operativas en [`CLAUDE.md`](./CLAUDE.md). Resumen: gitflow con `main`/`develop`/feature branches, conventional commits en inglés, PRs siempre contra `develop`, releases (`develop → main`) los mergea manualmente el mantenedor humano. Detalle completo en [`docs/contribuir.md`](./docs/contribuir.md).

## Otros recursos

- [`CLAUDE.md`](./CLAUDE.md) — guía de trabajo para Claude Code (también útil para humanos colaboradores).
