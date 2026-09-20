# Deployment

CargoLink corre en un **VPS propio** (`ubuntu-tesis01`) con Docker Compose: **prod** y **dev** en el mismo host, cada uno con su base, publicados a internet por **Cloudflare Tunnel**. El deploy continuo lo hace GitHub Actions con un runner self-hosted en el VPS.

- Pipeline: [`ci-cd.md`](./ci-cd.md)
- Por qué VPS + runner self-hosted: [`decision-deploy-vps.md`](./decision-deploy-vps.md)
- Setup anterior en GCP (apagado el 2026-09-14): [`decision-deploy-vps.md`](./decision-deploy-vps.md) § GCP

## Estado actual

| Pieza | Estado |
|---|---|
| Hosting | ✅ VPS `ubuntu-tesis01` (Ubuntu 26.04, 4 CPU, 7,3 GB RAM + 4 GB swap), Docker Engine + Compose |
| Exposición pública / TLS | ✅ Cloudflare Tunnel `cargolink-vps` (solo saliente; TLS en el edge de Cloudflare) |
| Dos entornos con DB separada | ✅ `cargolink` (prod, rama `main`) / `cargolink-dev` (dev, rama `develop`) |
| Deploy continuo | ✅ merge a `develop`→dev, `main`→prod ([`deploy-vps.yml`](../.github/workflows/deploy-vps.yml)) |
| Migraciones en deploy | ✅ corren en el `docker-entrypoint.sh` al arrancar |
| Backup pre-deploy (prod) | ✅ `deploy.sh` corre `~/backups/backup.sh` antes de levantar la versión nueva |
| Backup diario | ✅ cron 03:00, `pg_dump -Fc` de las dos bases (14 copias de prod, 7 de dev). Restore probado |
| Healthcheck post-deploy | ✅ `/` → 200 y `/api/geo/provinces` → 401 por la URL pública |
| Rollback | ⚠️ manual: imágenes `:previous` + restore si hubo migración (ver § Rollback) |
| Logs / métricas | ⚠️ solo `docker compose logs`; no hay métricas |
| Backups fuera del host | ❌ los dumps viven en el mismo disco del VPS |

## Acceso al VPS

**Solo por RDP** (`rpdcs.ddns.net:22989`). No hay SSH entrante ni se pueden abrir puertos en el router: todo lo que llega o sale del VPS es tráfico **saliente** (el túnel de Cloudflare, el runner de GitHub, `git fetch`). Los comandos se corren desde una terminal dentro de la sesión RDP, con el usuario `mfrias` (grupo `docker`).

## Layout en el VPS

Nada de esto tiene secretos en el repo. Los archivos versionados viven en [`../deploy/vps/`](../deploy/vps/); los `.env` son locales.

```
~/
├── cargolink/              clone de main = PROD
│   ├── .env                APP_HOST=plataforma.cargolink.com.ar, POSTGRES_*, JWT_*, CORS_ORIGIN,
│   │                       FRONTEND_URL, ADMIN_PASSWORD, SMTP_*   (no versionado)
│   └── deploy/vps/         compose.prod.yml, deploy.sh           (versionado)
├── cargolink-dev/          clone de develop = DEV
│   └── .env                COMPOSE_PROJECT_NAME=cargolink-dev, APP_HOST=dev.cargolink.com.ar, secretos propios
├── tunnel/
│   ├── docker-compose.yml  copia de deploy/vps/tunnel/docker-compose.yml
│   └── .env                TUNNEL_TOKEN   (no versionado)
├── backups/
│   └── backup.sh           pg_dump de las dos bases + retención (cron diario 03:00)
└── actions-runner/         runner self-hosted de GitHub (servicio systemd)
```

Alias recomendados en `~/.bashrc`:

```bash
alias dc='docker compose -f docker-compose.yml -f deploy/vps/compose.prod.yml'   # usar dentro de ~/cargolink
alias dcd='docker compose -f docker-compose.yml -f deploy/vps/compose.dev.yml'   # usar dentro de ~/cargolink-dev
```

Contenedores: `cargolink-{postgres,backend,frontend}-1`, `cargolink-dev-{postgres,backend,frontend}-1`, `tunnel-cloudflared-1`.

Los clones hacen pull por HTTPS con un **fine-grained PAT** de la cuenta `soportecargolink-ui` (Contents read-only, solo este repo) guardado en `~/.git-credentials`, porque la org tiene las deploy keys deshabilitadas. **Vence el 2027-09-13**: renovarlo antes o los deploys van a fallar en el `git fetch`.

## Cloudflare Tunnel

- Cuenta: soportecargolink@gmail.com. Zona `cargolink.com.ar` delegada desde DonWeb.
- Túnel `cargolink-vps`. El conector es el servicio `cloudflared` de `~/tunnel`, conectado a la red Docker externa **`edge`** (se crea una vez con `docker network create edge`).
- Rutas (dashboard de Cloudflare, en este orden):

| Hostname + path | Servicio |
|---|---|
| `plataforma.cargolink.com.ar/api/*` | `http://prod-backend:3001` |
| `plataforma.cargolink.com.ar` | `http://prod-frontend:3000` |
| `dev.cargolink.com.ar/api/*` | `http://dev-backend:3001` |
| `dev.cargolink.com.ar` | `http://dev-frontend:3000` |

Los aliases `prod-*` / `dev-*` los declaran los overrides [`compose.prod.yml`](../deploy/vps/compose.prod.yml) / [`compose.dev.yml`](../deploy/vps/compose.dev.yml). Los overrides también quitan los `ports:`, así que **nada queda publicado en el host**.

Apex y `www` apuntan a GitHub Pages (landing). No hay subdominio `api.`: la API se sirve en `/api` del mismo hostname de cada entorno.

## Runner self-hosted

### Instalación (una vez)

1. En GitHub: *Repo → Settings → Actions → Runners → New self-hosted runner → Linux x64*. La página muestra los comandos de descarga con la versión y el hash vigentes, y un token de registro que dura 1 hora.
2. En el VPS:

   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   # pegar acá los comandos "Download" de la página (curl + shasum + tar)

   ./config.sh --url https://github.com/CargoLink-proyecto-final/CargoLink \
     --token <TOKEN_DE_LA_PAGINA> \
     --name ubuntu-tesis01 --labels cargolink-vps --work _work --unattended

   sudo ./svc.sh install mfrias
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```

3. Verificar que el runner aparece **Idle** en *Settings → Actions → Runners* con los labels `self-hosted`, `Linux`, `X64` y `cargolink-vps`.

El runner corre como `mfrias`, así que usa su `~/.git-credentials`, su grupo `docker` y `~/backups/backup.sh`. Se actualiza solo.

### Operación

```bash
cd ~/actions-runner
sudo ./svc.sh status | stop | start
journalctl -u 'actions.runner.*' -f        # logs del servicio
```

### Seguridad

- `deploy-vps.yml` solo dispara en `push` a `main`/`develop`. **Nunca** uses el label `cargolink-vps` / `self-hosted` en workflows de `pull_request`.
- Riesgo aceptado: **cualquiera con permiso de escritura en el repo puede ejecutar código en el VPS**, pusheando un workflow propio que apunte al runner desde cualquier rama. En GitHub Free no se puede restringir un runner a un workflow. Mantené mínima la lista de colaboradores con escritura y no habilites forks del repo privado. Detalle en [`decision-deploy-vps.md`](./decision-deploy-vps.md).

## Cómo se deploya

Automático al mergear (ver [`ci-cd.md`](./ci-cd.md)). A mano, como plan B, desde el VPS:

```bash
~/cargolink/deploy/vps/deploy.sh prod           # punta de origin/main
~/cargolink-dev/deploy/vps/deploy.sh dev        # punta de origin/develop
~/cargolink/deploy/vps/deploy.sh prod <sha>     # un commit puntual (debe estar en main)
```

Pasos: fast-forward del clone → tag `:previous` → build → backup (solo prod) → `up -d --no-build` → healthcheck → limpieza. Un build completo tarda unos 7 minutos; el corte de servicio es solo el tiempo en que se recrean los contenedores más las migraciones.

**Nunca** `docker compose down -v`: borra el volumen `pgdata` con la base.

## Variables de entorno de producción

Viven en el `.env` de cada clone (ver [`docker.md`](./docker.md) para la tabla completa). Lo crítico:

| Var | Recomendación |
|---|---|
| `APP_HOST` | Dominio público del entorno. Lo usan el override (para `NEXT_PUBLIC_API_URL`) y el healthcheck de `deploy.sh`. |
| `COMPOSE_PROJECT_NAME` | Solo en dev: `cargolink-dev`. Sin esto, dev pisaría los contenedores y el volumen de prod. |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32`. Distinta entre prod y dev. |
| `JWT_SECRET` | `openssl rand -base64 64`. Distinto entre prod y dev. |
| `CORS_ORIGIN`, `FRONTEND_URL` | `https://$APP_HOST`. `FRONTEND_URL` la usan los emails de verify/reset. |
| `ADMIN_PASSWORD` | Obligatoria en prod. Si queda vacía, el seed usa un fallback versionado en el repo. |
| `SMTP_*` | Cuenta real (Gmail soportecargolink@gmail.com con app password). |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | En el `.env` del clone, como el resto de los secretos — no salen del VPS. Ambas opcionales: sin ellas el [asistente de carga](./asistente-carga.md) sigue andando en modo básico. Ojo con el free tier de AI Studio: Google puede entrenar con los prompts, así que para prod conviene tier pago. |
| `ASSISTANT_FLOW_CONFIG_PATH` | El contenedor del backend **no tiene volumen**, así que el flujo editado desde el panel admin vive en su filesystem y **se pierde en cada deploy** (los contenedores se recrean). Para que persista hay que montar un volumen en esta ruta. Ver el caveat en [`asistente-carga.md`](./asistente-carga.md). |
| `NEXT_PUBLIC_API_URL` | No va en el `.env`: es build-arg y lo arma el override. |

Si un secreto se commitea por accidente: **rotalo** (no alcanza con borrar el commit) y avisá antes de reescribir historia.

## Migraciones en el deploy

Las migraciones se aplican automáticamente al arrancar el backend (`docker-entrypoint.sh` corre `prisma migrate deploy` + seed antes de levantar el server).

**Implicaciones**:
- Todo lo que esté en `prisma/migrations/` se aplica sin intervención manual en el primer arranque después del deploy.
- Una migración pesada **demora el arranque del backend**. Mientras tanto la API responde 502 a través del túnel y el healthcheck reintenta hasta 300 s (`HEALTH_TIMEOUT`).
- En prod, `deploy.sh` toma un backup **justo antes** de levantar la versión nueva. Si el backup falla, el deploy aborta sin tocar los contenedores.

### Recomendaciones

- Migraciones 🟢 (columna opcional, índice no único, tabla nueva): aplicar normalmente.
- Migraciones 🟡 (rename, índice único nuevo, cambio de tipo): el backup automático cubre; revisá que el restore del día esté sano.
- Migraciones 🔴 (drop columna o tabla, FK con backfill): probar el restore en dev antes y considerar deploy en dos pasos (*expand & contract*: primero dejar de leer la columna, después el drop).

## Backups

`~/backups/backup.sh` corre `pg_dump -Fc` de las dos bases con retención (14 dumps de prod, 7 de dev). Se ejecuta:

- **todos los días a las 03:00** (cron de `mfrias`);
- **antes de cada deploy a prod** (lo llama `deploy.sh`).

El script no está versionado (vive solo en el VPS). Para `deploy.sh` alcanza con que sea ejecutable y devuelva exit code ≠ 0 si falla.

⚠️ Los dumps quedan en el mismo disco del VPS. Si se pierde el host, se pierden los backups. Pendiente: copiarlos fuera (Backblaze, Drive, etc.).

Backup manual puntual:

```bash
~/backups/backup.sh
# o solo prod:
docker exec cargolink-postgres-1 pg_dump -U postgres -Fc cargolink > ~/backups/manual-$(date +%F-%H%M).dump
```

## Restore

```bash
cd ~/cargolink
dc stop backend                                   # que nadie escriba durante el restore
docker exec -i cargolink-postgres-1 \
  pg_restore -U postgres -d cargolink --clean --if-exists < ~/backups/<dump-de-prod>.dump
dc start backend
```

Para dev: `cd ~/cargolink-dev`, `dcd` y el contenedor `cargolink-dev-postgres-1`. Usuario y base salen de `POSTGRES_USER`/`POSTGRES_DB` del `.env` (default `postgres`/`cargolink`).

## Rollback

Cada deploy guarda las imágenes que estaban corriendo como `<proyecto>-backend:previous` y `<proyecto>-frontend:previous` (solo se conserva **una** versión anterior).

```bash
cd ~/cargolink                     # dev: ~/cargolink-dev, proyecto cargolink-dev, alias dcd

# 1. SOLO si el deploy aplicó una migración que rompió datos: restaurar primero
#    el dump pre-deploy (el más reciente de prod en ~/backups) — ver § Restore.

# 2. Volver a las imágenes anteriores sin rebuild
docker image tag cargolink-backend:previous  cargolink-backend:latest
docker image tag cargolink-frontend:previous cargolink-frontend:latest
dc up -d --no-build backend frontend
```

3. Revertí el cambio en git con un PR de revert. Si no, el próximo push a la rama vuelve a deployar lo roto.

⚠️ El rollback de imagen **no revierte migraciones**. Una imagen vieja con un schema nuevo puede fallar, así que el orden es: restore del backup → imagen anterior.

## Healthchecks

`deploy.sh` valida contra la URL pública, pasando por Cloudflare:

| Check | Esperado | Qué prueba |
|---|---|---|
| `GET https://$APP_HOST/` | 200 | frontend arriba y ruta del túnel OK |
| `GET https://$APP_HOST/api/geo/provinces` | 401 | Nest levantó (migraciones terminadas), el guard JWT responde y la ruta `/api/*` del túnel OK |

A nivel compose, Postgres tiene healthcheck (`pg_isready`); backend y frontend no.

### Frontend en 502 y API OK

Si el healthcheck muestra `frontend=false api=true` y la URL pública da 502, lo más probable es que Next esté escuchando solo en la IP de la red `default` y cloudflared no lo alcance por `edge`. Pasó en el primer deploy a prod (2026-09-14). La imagen trae `ENV HOSTNAME=0.0.0.0` para evitarlo. Para verificarlo:

```bash
docker logs cargolink-frontend-1 --tail 5    # tiene que decir Network: http://0.0.0.0:3000
docker run --rm --network edge curlimages/curl -s -o /dev/null -w '%{http_code}\n' http://prod-frontend:3000/
```

Si hacés rollback a una imagen `:previous` construida antes de ese fix, el 502 vuelve. Levantala con un override que setee `HOSTNAME: 0.0.0.0` en `frontend.environment`.

## Smoke test post-deploy

El healthcheck es automático; lo funcional sigue siendo manual:

1. Login con una cuenta demo y con la cuenta admin.
2. `GET /api/users/me` con el token devuelve el user.
3. Dashboard de shipper y de carrier cargan; publicar una carga de prueba en **dev**.
4. Chat (WebSocket) conecta.

## Logs

```bash
cd ~/cargolink && dc logs -f --tail=200 backend        # dev: cd ~/cargolink-dev && dcd logs ...
docker logs -f tunnel-cloudflared-1                    # túnel
```

Los logs de cada deploy quedan en la pestaña Actions del repo.

## Checklist antes de un release a prod

- [ ] El runner figura *Idle* en *Settings → Actions → Runners*.
- [ ] Migraciones revisadas y riesgos clasificados (informe del `release-engineer`).
- [ ] Si hay 🔴: restore probado en dev y plan de *expand & contract*.
- [ ] Backup diario reciente sano en `~/backups` (el pre-deploy lo toma el pipeline).
- [ ] Plan de rollback definido (§ Rollback).
- [ ] Post-merge: job `deploy-prod` verde en Actions + smoke test manual.

Para el flujo formal de release, ver [`contribuir.md`](./contribuir.md) § "Flujo de release".
