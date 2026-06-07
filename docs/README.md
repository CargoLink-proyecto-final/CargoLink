# Documentación de CargoLink

Plataforma digital de gestión de transporte de carga por carretera que conecta dadores de carga (shippers) con transportistas (carriers). Esta carpeta es la fuente de verdad técnica del proyecto. Si solo querés levantar el stack localmente, [`primeros-pasos.md`](./primeros-pasos.md) alcanza.

## Mapa de la documentación

| Documento | Cubre |
|---|---|
| [`arquitectura.md`](./arquitectura.md) | Overview técnico, componentes, flujo end-to-end, matriz de roles. |
| [`primeros-pasos.md`](./primeros-pasos.md) | Setup con Docker Compose y dev local, prerequisitos, cuentas demo, troubleshooting. |
| [`docker.md`](./docker.md) | `docker-compose.yml`, Dockerfiles backend/frontend, entrypoint, tabla consolidada de env vars. |
| [`backend.md`](./backend.md) | Estructura NestJS, bootstrap, módulos, guards, decorators, mail service, comandos de dev. |
| [`api.md`](./api.md) | Referencia REST completa: Auth, Users, Loads, Postulations, Trips, Messages, Ratings. |
| [`websockets.md`](./websockets.md) | Socket.IO `/chat`: rooms, eventos `sendMessage`/`newMessage`, ejemplo de cliente. |
| [`base-de-datos.md`](./base-de-datos.md) | Schema Prisma: enums, modelos, relaciones, índices, migraciones, seed. |
| [`autenticacion.md`](./autenticacion.md) | Flujo register/verify/login, JWT, guards, roles, password reset, token storage frontend/mobile. |
| [`frontend.md`](./frontend.md) | Next.js 14 App Router, rutas, componentes, estado (Zustand + React Query), Tailwind. |
| [`mobile.md`](./mobile.md) | Expo SDK 50, screens por rol, navegación, GPS, push notifications, permisos. |
| [`ci-cd.md`](./ci-cd.md) | GitHub Actions → deploy a Cloud Run (`dev`/`prod`), Artifact Registry, Workload Identity Federation. |
| [`deployment.md`](./deployment.md) | Variables de entorno de prod, servicios recomendados, migraciones, healthchecks, rollback. |
| [`workflow-claude-code.md`](./workflow-claude-code.md) | `.claude/` tooling — hooks, skills, agents, slash-commands. |
| [`contribuir.md`](./contribuir.md) | Gitflow, naming de ramas, conventional commits, flujo de PR/release, secretos. |

## Convenciones

- **Idioma**: docs en español. Código, identificadores, paths, commits y títulos de PR en inglés.
- **Links a archivos del repo**: relativos desde la raíz (`../backend/src/main.ts`), clickeables en GitHub.
- **Links a otras docs**: relativos al folder (`./api.md`).
- **Code blocks**: con language hint para syntax highlight (` ```bash `, ` ```ts `, etc.).

## Cuándo actualizar qué

| Cambiaste… | Actualizá… |
|---|---|
| Un endpoint del backend | [`api.md`](./api.md) y, si aplica, [`backend.md`](./backend.md) |
| El schema Prisma | [`base-de-datos.md`](./base-de-datos.md) |
| El gateway de WebSocket | [`websockets.md`](./websockets.md) |
| `docker-compose.yml` o un Dockerfile | [`docker.md`](./docker.md) y [`primeros-pasos.md`](./primeros-pasos.md) |
| El workflow de GitHub Actions | [`ci-cd.md`](./ci-cd.md) |
| Una ruta o componente de frontend | [`frontend.md`](./frontend.md) |
| Algo de `.claude/` | [`workflow-claude-code.md`](./workflow-claude-code.md) |

## Documentos fuera de esta carpeta

- [`../README.md`](../README.md) — landing page del repo, quick start mínimo, link a estas docs.
- [`../CLAUDE.md`](../CLAUDE.md) — reglas operativas para Claude Code en este repo (branching, commits, workflow de PR).
