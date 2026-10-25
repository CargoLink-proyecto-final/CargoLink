# Documentación de CargoLink

Plataforma digital de gestión de transporte de carga por carretera que conecta dadores de carga (shippers) con transportistas (carriers). Esta carpeta es la fuente de verdad técnica del proyecto. Si solo querés levantar el stack localmente, [`primeros-pasos.md`](./primeros-pasos.md) alcanza.

> **¿No sabés por dónde empezar?** [`resumen.md`](./resumen.md) es el mapa completo del repo: qué hay, dónde está cada feature (full-stack) y a qué doc ir.

## Mapa de la documentación

| Documento | Cubre |
|---|---|
| [`resumen.md`](./resumen.md) | **Mapa general**: estructura del repo, dónde vive cada feature en backend/frontend/mobile, índice de todo. |
| [`arquitectura.md`](./arquitectura.md) | Overview técnico lógico, componentes, flujo end-to-end, matriz de roles. |
| [`primeros-pasos.md`](./primeros-pasos.md) | Setup con Docker Compose y dev local, prerequisitos, cuentas demo, troubleshooting. |
| [`docker.md`](./docker.md) | `docker-compose.yml`, Dockerfiles backend/frontend, entrypoint, tabla consolidada de env vars. |
| [`backend.md`](./backend.md) | Estructura NestJS, bootstrap, módulos, guards, decorators, mail service, comandos de dev. |
| [`api.md`](./api.md) | Referencia REST completa: Auth, Users, Loads, Postulations, Trips, Messages, Ratings, Companies. |
| [`empresas.md`](./empresas.md) | Flotas multi-conductor: rol `COMPANY_ADMIN`, modelo de datos, flujo de unión, endpoints, métricas. |
| [`websockets.md`](./websockets.md) | Socket.IO `/chat`: rooms, eventos `sendMessage`/`newMessage`, ejemplo de cliente. |
| [`base-de-datos.md`](./base-de-datos.md) | Schema Prisma: enums, modelos, relaciones, índices, migraciones, seed. |
| [`autenticacion.md`](./autenticacion.md) | Flujo register/verify/login, JWT, guards, roles, password reset, token storage frontend/mobile. |
| [`frontend.md`](./frontend.md) | Next.js 14 App Router, rutas, componentes, estado (Zustand + React Query), Tailwind. |
| [`mobile.md`](./mobile.md) | Expo SDK 50, screens por rol, navegación, GPS, push notifications, permisos. |
| [`ci-cd.md`](./ci-cd.md) | GitHub Actions con runner self-hosted → deploy al VPS (`develop`→dev, `main`→prod), healthcheck. |
| [`deployment.md`](./deployment.md) | VPS: layout, Cloudflare Tunnel, runner, env vars, migraciones, backups, restore, rollback. |
| [`decision-deploy-vps.md`](./decision-deploy-vps.md) | Decisión: deploy al VPS con runner self-hosted y alternativas descartadas. |
| [`calidad/`](./calidad/) | TP de Calidad de Software sobre el módulo trips: [SonarCloud](./calidad/sonarcloud-setup.md), [pruebas de carga y smoke](./calidad/pruebas-carga.md), [integración OSRM y E2E post-deploy](./calidad/integracion-osrm-e2e.md), [ISO/IEC 25010, métricas y herramienta nueva](./calidad/calidad-iso25010-metricas-herramienta.md). |
| [`workflow-claude-code.md`](./workflow-claude-code.md) | `.claude/` tooling — hooks, skills, agents, slash-commands. |
| [`contribuir.md`](./contribuir.md) | Gitflow, naming de ramas, conventional commits, flujo de PR/release, secretos. |

> Los archivos del VPS están en [`../deploy/vps/`](../deploy/vps/) y se documentan en [`deployment.md`](./deployment.md). El setup anterior en GCP (Terraform en `infra/gcp/`, `arquitectura-gcp.md`) se apagó el 2026-09-14 y quedó solo en el historial de git: ver [`decision-deploy-vps.md`](./decision-deploy-vps.md) § GCP.

## Convenciones

- **Idioma**: docs en español. Código, identificadores, paths, commits y títulos de PR en inglés.
- **Links a archivos del repo**: relativos desde la raíz (`../backend/src/main.ts`), clickeables en GitHub.
- **Links a otras docs**: relativos al folder (`./api.md`).
- **Code blocks**: con language hint para syntax highlight (` ```bash `, ` ```ts `, etc.).

## Cuándo actualizar qué

| Cambiaste… | Actualizá… |
|---|---|
| Un endpoint del backend | [`api.md`](./api.md) y, si aplica, [`backend.md`](./backend.md) |
| Algo de empresas/flotas | [`empresas.md`](./empresas.md) |
| El schema Prisma | [`base-de-datos.md`](./base-de-datos.md) |
| La estructura del repo o dónde vive algo | [`resumen.md`](./resumen.md) |
| El gateway de WebSocket | [`websockets.md`](./websockets.md) |
| `docker-compose.yml` o un Dockerfile | [`docker.md`](./docker.md) y [`primeros-pasos.md`](./primeros-pasos.md) |
| El workflow de GitHub Actions | [`ci-cd.md`](./ci-cd.md) |
| Algo de `deploy/vps/` o del VPS | [`deployment.md`](./deployment.md) y [`ci-cd.md`](./ci-cd.md) |
| Una ruta o componente de frontend | [`frontend.md`](./frontend.md) |
| Algo de `.claude/` | [`workflow-claude-code.md`](./workflow-claude-code.md) |

## Documentos fuera de esta carpeta

- [`../README.md`](../README.md) — landing page del repo, quick start mínimo, link a estas docs.
- [`../CLAUDE.md`](../CLAUDE.md) — reglas operativas para Claude Code en este repo (branching, commits, workflow de PR).
