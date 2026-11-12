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
| Smoke test post-deploy | ✅ `smoke.sh` sobre el módulo trips (solo lectura) |
| Rollback | ⚠️ manual: imágenes `:previous` + restore si hubo migración (ver § Rollback) |
| Logs / métricas | ⚠️ solo `docker compose logs`; no hay métricas |
| Backups fuera del host | ❌ los dumps viven en el mismo disco del VPS |

## Acceso al VPS

Hay dos vías, las dos con el usuario `mfrias` (grupo `docker`):

- **SSH por el Cloudflare Tunnel** (`ssh.cargolink.com.ar`, detrás de Cloudflare Access). Es la vía preferida para operar: va por el mismo túnel que la web, que se reconecta solo después de un corte de red. Setup en § Acceso por SSH.
- **RDP** (`rpdcs.ddns.net:22989`), por un puerto redirigido en el router del hosting más un DNS dinámico. Queda como respaldo y para lo que necesite escritorio. Se ha colgado después de cortes de red del hosting.

No se pueden abrir puertos en el router: salvo el RDP, todo lo que llega o sale del VPS es tráfico **saliente** (el túnel de Cloudflare, el runner de GitHub, `git fetch`).

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
| `ssh.cargolink.com.ar` | `ssh://host.docker.internal:22` (protegida con Access, ver § Acceso por SSH) |

Los aliases `prod-*` / `dev-*` los declaran los overrides [`compose.prod.yml`](../deploy/vps/compose.prod.yml) / [`compose.dev.yml`](../deploy/vps/compose.dev.yml). Los overrides también quitan los `ports:`, así que **nada queda publicado en el host**.

Apex y `www` apuntan a GitHub Pages (landing). No hay subdominio `api.`: la API se sirve en `/api` del mismo hostname de cada entorno.

## Acceso por SSH

`ssh.cargolink.com.ar` llega al `sshd` del host a través del túnel. Hay dos barreras: **Cloudflare Access** (login con un mail autorizado) y **sshd solo con clave** ([`../deploy/vps/sshd/10-cargolink.conf`](../deploy/vps/sshd/10-cargolink.conf)). No hay secretos en GitHub: este acceso es para personas, no para el CI.

### Setup en el VPS (una vez, desde RDP)

```bash
sudo apt install -y openssh-server

# config endurecida (sin password, sin root, solo mfrias)
sudo cp ~/cargolink/deploy/vps/sshd/10-cargolink.conf /etc/ssh/sshd_config.d/
sudo sshd -t && sudo systemctl restart ssh     # sshd -t valida la sintaxis antes de reiniciar

# claves autorizadas: la pública de cada persona (ver § Cliente)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo '<contenido de cargolink_vps.pub>' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys

# el túnel necesita el extra_hosts nuevo del compose
cp ~/cargolink/deploy/vps/tunnel/docker-compose.yml ~/tunnel/
cd ~/tunnel && docker compose up -d

# chequeo: el contenedor del túnel tiene que llegar al sshd del host
docker run --rm --add-host host.docker.internal:host-gateway --network edge \
  busybox nc -zv -w 3 host.docker.internal 22
```

Si el chequeo falla y `sudo ufw status` dice `active`, habilitá el puerto para las redes de Docker: `sudo ufw allow from 172.16.0.0/12 to any port 22 proto tcp`.

`sshd` escucha en todas las interfaces, así que el puerto 22 también queda abierto en la LAN del hosting (no hacia internet: el router no lo redirige). Con login solo por clave, el riesgo es bajo.

### Setup en Cloudflare (una vez)

**El orden importa**: primero la aplicación de Access y después la ruta, para que el hostname nunca quede publicado sin protección. Los nombres de menú son los del dashboard unificado (2026-10).

1. Policy: *Zero Trust → Access controls → Policies → Add*. Nombre `Solo soporte`, acción *Allow*, *Include → Emails* → `soportecargolink@gmail.com` (más el de cada persona que opere el VPS). Ojo: *Emails*, no *Emails ending in*.
2. Aplicación: *Zero Trust → Access controls → Applications → Create new application → Self-hosted and private*.
   - *Destinations → Public hostnames*: subdominio `ssh`, dominio `cargolink.com.ar`, sin path.
   - *Browser-based RDP, SSH, or VNC*: **apagado**. La terminal en el navegador necesita la CA de certificados cortos de Cloudflare en el `sshd`, y no está configurada.
   - *Access policies → Add current policies* → `Solo soporte`.
   - *Authentication → Choose identity providers* → *Select all*. Sin proveedores configurados, queda el One-time PIN por mail.
   - *Session duration*: 24 h. *Create*.
3. Ruta: *Networking → Tunnels → cargolink-vps → Published application routes → Add*: subdominio `ssh`, dominio `cargolink.com.ar`, **Service URL `ssh://host.docker.internal:22`**. Sin el `ssh://`, Cloudflare la toma como HTTP.

Verificación: `curl -sI https://ssh.cargolink.com.ar` tiene que devolver `302` hacia `*.cloudflareaccess.com`. Si devuelve `200`, la aplicación de Access no está cubriendo el hostname y solo queda la barrera de `sshd`.

### Cliente (cada persona)

Una clave dedicada para el VPS:

```bash
brew install cloudflared
ssh-keygen -t ed25519 -f ~/.ssh/cargolink_vps -C "soportecargolink@gmail.com"
ssh-add --apple-use-keychain ~/.ssh/cargolink_vps
cat ~/.ssh/cargolink_vps.pub
```

La salida del `cat` es la línea que va al `~/.ssh/authorized_keys` del VPS. El `ssh-add` guarda la passphrase en el llavero de macOS.

En `~/.ssh/config`:

```
Host cargolink-vps
  HostName ssh.cargolink.com.ar
  User mfrias
  IdentityFile ~/.ssh/cargolink_vps
  IdentitiesOnly yes
  UseKeychain yes
  AddKeysToAgent yes
  ProxyCommand cloudflared access ssh --hostname %h
```

Después: `ssh cargolink-vps`. Abre el navegador para el login de Access una vez por sesión (24 h). La primera conexión pregunta por la huella del host; comparala con `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` en el VPS, pero respondé rápido: si la pregunta queda abierta un rato, el túnel corta la conexión (`Broken pipe`) y hay que reintentar.

Para sacarle el acceso a alguien: quitar su mail de la política de Access **y** su línea de `~/.ssh/authorized_keys`.

### Qué se puede resolver por SSH

Regla práctica: si `plataforma.cargolink.com.ar` carga, el túnel está arriba y el SSH entra.

| Situación | ¿SSH? | Qué hacer |
|---|---|---|
| Runner offline o RDP colgado, la web anda | ✅ | `sudo systemctl restart 'actions.runner.*'` o `sudo systemctl restart xrdp`. Si no alcanza, `sudo reboot` |
| Sin salida a internet en el hosting | ❌ | No entra nada; la web también cae. Cuando vuelve la red, el túnel se reconecta solo |
| VM colgada (kernel, sin memoria) | ❌ | Solo soporte del hosting, desde la consola del hipervisor |

### Pegar comandos en la terminal del RDP

El portapapeles del RDP se lleva mal con el *bracketed paste* de bash: el primer comando pegado llega con `^[[200~` adelante (y falla con `command not found`) y el último puede llegar con un `~` de más al final. Escribí a mano `bind 'set enable-bracketed-paste off'` al abrir la terminal, o pegá los comandos de a uno. Por SSH no pasa.

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
| `E2E_PASSWORD` | **Solo dev.** Crea las cuentas del E2E post-deploy y lo habilita. En prod no se define. |
| `SMTP_*` | Cuenta real (Gmail soportecargolink@gmail.com con app password). |
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

Después del healthcheck, `deploy.sh` corre [`smoke.sh`](../deploy/vps/smoke.sh) sobre el módulo de viajes. Es de solo lectura; los checks autenticados usan `SMOKE_EMAIL`/`SMOKE_PASSWORD` del `.env` del entorno si están definidas. Si falla, el deploy queda en rojo. Detalle en [`calidad/pruebas-carga.md`](./calidad/pruebas-carga.md#smoke-test-post-deploy).

En dev, después del smoke corre además el E2E del módulo de viajes ([`e2e-trips.mjs`](../deploy/vps/e2e-trips.mjs)): publica una carga, la asigna, hace el viaje completo con OSRM real y lo califica. Necesita `E2E_PASSWORD` en el `.env`; sin ella se saltea. Detalle en [`calidad/integracion-osrm-e2e.md`](./calidad/integracion-osrm-e2e.md).

El resto sigue siendo manual:

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
