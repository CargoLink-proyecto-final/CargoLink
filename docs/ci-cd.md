# CI/CD

Single workflow en GitHub Actions que buildea las imágenes Docker de backend y frontend y las publica a GitHub Container Registry (GHCR) cada vez que se mergea a `main` o `develop`.

Source: [`../.github/workflows/docker-build-push.yml`](../.github/workflows/docker-build-push.yml).

## Cuándo dispara

```yaml
on:
  push:
    branches: [main, develop]
```

Solo `push` directo a esas ramas (incluye merges de PR, porque GitHub registra el merge como push a la rama base). **Los PRs no disparan el workflow** — no hace test ni lint, solo build & push de imágenes ya aprobadas.

## Qué hace

```
push a main o develop
       │
       ▼
  job: build-and-push (ubuntu-latest)
       │
       ├── checkout
       ├── set env tag
       │     main    → tag=prod, backend_port=8030, frontend_port=3030
       │     develop → tag=dev,  backend_port=8035, frontend_port=3035
       │     sha (7 chars)
       ├── lowercase image owner (gh org puede tener uppercase, ghcr no acepta)
       ├── login a ghcr.io con GITHUB_TOKEN
       ├── set up Docker Buildx
       ├── build & push backend
       │     context: ./backend
       │     tags: cargolink-backend:<tag> + cargolink-backend:<branch>-<sha>
       │     cache: gha scope=backend-<branch>
       │     build-arg: PORT=<backend_port>
       └── build & push frontend
             context: ./frontend
             tags: cargolink-frontend:<tag> + cargolink-frontend:<branch>-<sha>
             cache: gha scope=frontend-<branch>
             build-args: PORT=<frontend_port>, BACKEND_PORT=<backend_port>
```

## Imágenes publicadas

Las imágenes terminan en `ghcr.io/<owner-lowercase>/cargolink-{backend,frontend}` con dos tags:

| Tag | Cuándo se publica |
|---|---|
| `prod` | push a `main` |
| `dev` | push a `develop` |
| `<branch>-<sha-7>` | siempre (`main-abc1234`, `develop-abc1234`) — útil para rollback puntual o pinear una versión |

### Asignación de puertos por rama

| Rama | Backend port | Frontend port |
|---|---|---|
| `main` (prod) | 8030 | 3030 |
| `develop` (dev) | 8035 | 3035 |

Estos puertos se pasan como build args (`PORT`, `BACKEND_PORT`). Hoy los Dockerfiles del repo **no usan estos args** — el backend está hardcoded a `EXPOSE 3001` y el frontend a `EXPOSE 3000`. Los args están preparados para cuando se quiera servir cada entorno en su puerto propio sin tener que reconstruir manualmente; mientras tanto, el orquestador en el server tiene que mapear `<host-port>:3001` y `<host-port>:3000` con esos puertos del host (8030/8035 backend, 3030/3035 frontend).

## Permisos del workflow

```yaml
permissions:
  contents: read
  packages: write
```

`packages: write` es lo que le permite hacer push a GHCR usando el `GITHUB_TOKEN` automático — no hace falta crear un PAT manual mientras el repo es del mismo owner que el package.

## Login a GHCR

```yaml
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

`github.actor` es quien disparó el push (o el bot que mergeó). El `GITHUB_TOKEN` se inyecta automáticamente.

## Cache

```yaml
cache-from: type=gha,scope=backend-${{ github.ref_name }}
cache-to: type=gha,mode=max,scope=backend-${{ github.ref_name }}
```

Caché de capas Docker en el storage de GitHub Actions, segmentado por servicio (backend/frontend) y rama. `mode=max` cachea también las capas intermedias, no sólo el resultado final — mejora cold starts a costa de usar más storage.

Es un caché grato pero no agresivo: builds incrementales después de pequeños cambios en `src/` son rápidos; cambios a `package.json` invalidan la capa de deps y obligan a rebuildear desde ahí.

## Por qué no hay CI de tests / lint

El repo tiene infraestructura de tests (Jest configurado en backend) pero **no tiene tests escritos todavía**. Tampoco hay step de lint. Esto es deliberado por etapa del proyecto — la calidad pasa por el flujo de PR + el subagente `qa-engineer` (ver [`workflow-claude-code.md`](./workflow-claude-code.md)).

Cuando se sumen tests, lo natural sería:
- Sumar un workflow `pr-checks.yml` que dispare en `pull_request` y corra `npm test` + `npm run lint` + `npx prisma format --check` (backend) y `npm run lint` + `npm run build` (frontend).
- Hacerlo gating del merge.
- Mantener `docker-build-push.yml` separado, solo en post-merge.

## PR template

Source: [`../.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

Estructura mínima — Summary, Commits, Test plan, Checklist. La completa el comando `/pr` (ver [`workflow-claude-code.md`](./workflow-claude-code.md)) con el output del subagente `qa-engineer`.

## Cómo ver imágenes publicadas

En GitHub:
1. Ir a la org/owner del repo → "Packages".
2. Ver `cargolink-backend` y `cargolink-frontend`.
3. Cada uno lista los tags disponibles.

Por CLI:

```bash
# Login con un PAT que tenga read:packages
echo $GHCR_PAT | docker login ghcr.io -u <username> --password-stdin

# Pull
docker pull ghcr.io/<owner>/cargolink-backend:dev
docker pull ghcr.io/<owner>/cargolink-frontend:dev

# Run específico
docker run --rm -p 3001:3001 \
  -e DATABASE_URL=... -e JWT_SECRET=... \
  ghcr.io/<owner>/cargolink-backend:dev
```

## Visibilidad de los packages

Por default GHCR hereda la visibilidad del repo. Si el repo es privado, los packages también. Para deploy desde un server externo se necesita o bien un PAT con `read:packages` o configurar el package como público desde la UI de GitHub.

## Rollback

Para volver a una versión anterior:

```bash
# Listar tags por SHA
gh api /users/<owner>/packages/container/cargolink-backend/versions

# Pull del tag específico
docker pull ghcr.io/<owner>/cargolink-backend:main-abc1234

# Tag como "prod" actual en el server
docker tag ghcr.io/<owner>/cargolink-backend:main-abc1234 ghcr.io/<owner>/cargolink-backend:prod
docker push ghcr.io/<owner>/cargolink-backend:prod
```

O simplemente cambiar el `image` en el `docker-compose.prod.yml` (cuando exista) al tag `main-abc1234` y `docker compose up -d`.

## Caveats

- **Workflow no falla nunca por calidad de código** — solo falla si el build de Docker falla. Mergear código roto es posible en teoría. Mitigado por el flujo de `/pr` + `qa-engineer`.
- **No corre migraciones de DB en CI**. Las migraciones se aplican al startup del contenedor en el server (`docker-entrypoint.sh`). Si una migración tiene un error, lo descubrís al deploy, no antes.
- **No detecta secretos commiteados**. Vale la pena sumar un step con `trufflehog` o similar.
- **El job es serial** (backend después de frontend), aunque podrían paralelizarse. Para builds rápidos, considerar dividir en dos jobs.
- **`PORT` build-arg no está implementado en los Dockerfiles actuales** — está preparado para futuro multi-instancia en el mismo host.
- **Sin trigger manual** (`workflow_dispatch`). Si necesitás rebuildear sin push, hay que pushear un commit vacío o disparar desde la UI agregándolo al `on:` block.
