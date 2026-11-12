#!/usr/bin/env bash
# Deploy de CargoLink en el VPS (prod o dev).
#
#   deploy/vps/deploy.sh <prod|dev> [sha]
#
# Lo corre el runner self-hosted desde .github/workflows/deploy-vps.yml, y
# también sirve a mano como plan B si el runner está caído. Opera sobre el
# clone del entorno (~/cargolink o ~/cargolink-dev), que es quien tiene el
# `.env` con los secretos:
#
#   1. fast-forward del clone al commit a deployar (nunca reescribe historia)
#   2. taggea las imágenes actuales como :previous (rollback sin rebuild)
#   3. build de backend y frontend con los contenedores viejos sirviendo
#   4. [solo prod] backup de la DB — las migraciones corren solas al arrancar
#   5. up -d --no-build (recrea solo lo que cambió)
#   6. healthcheck contra la URL pública (a través de Cloudflare), smoke del
#      módulo trips y [solo dev] el E2E de trips (e2e-trips.mjs)
#   7. limpieza de imágenes huérfanas y build cache viejo
#
# Nunca hace `down` ni borra volúmenes.
#
# Variables opcionales: CARGOLINK_PROD_DIR, CARGOLINK_DEV_DIR, BACKUP_SCRIPT,
# HEALTH_TIMEOUT (segundos, default 300).

set -Eeuo pipefail

log() { printf '\n==> %s\n' "$*"; }
die() { printf '::error::%s\n' "$*" >&2; exit 1; }

group() { [[ -n "${GITHUB_ACTIONS:-}" ]] && echo "::group::$*" || log "$*"; }
endgroup() { [[ -n "${GITHUB_ACTIONS:-}" ]] && echo "::endgroup::" || true; }

summary() { [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && echo "$*" >>"$GITHUB_STEP_SUMMARY" || true; }

# Devuelve 0 si la URL responde con el código esperado.
http_is() {
  local url="$1" expected="$2" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)
  [[ "$code" == "$expected" ]]
}

main() {
  local env_name="${1:-}" sha="${2:-}"
  local app_dir branch
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  case "$env_name" in
    prod) app_dir="${CARGOLINK_PROD_DIR:-$HOME/cargolink}"; branch=main ;;
    dev) app_dir="${CARGOLINK_DEV_DIR:-$HOME/cargolink-dev}"; branch=develop ;;
    *) die "Uso: $0 <prod|dev> [sha]" ;;
  esac

  [[ -d "$app_dir/.git" ]] || die "No existe el clone $app_dir"
  [[ -f "$app_dir/.env" ]] || die "Falta $app_dir/.env"
  local backup_script="${BACKUP_SCRIPT:-$HOME/backups/backup.sh}"
  if [[ "$env_name" == "prod" && ! -x "$backup_script" ]]; then
    die "No encuentro $backup_script ejecutable; no deployo prod sin backup"
  fi
  cd "$app_dir"

  # Un deploy por vez en todo el host: dos builds en paralelo no entran en RAM,
  # y así un deploy manual no se cruza con uno del runner.
  exec 9>/tmp/cargolink-deploy.lock
  if ! flock -n 9; then
    log "Hay otro deploy en curso; esperando el lock..."
    flock 9
  fi

  local dc=(docker compose -f docker-compose.yml -f "deploy/vps/compose.$env_name.yml")

  # ── 1. Código ──
  group "Sync $app_dir → ${sha:-origin/$branch}"
  local current
  current=$(git symbolic-ref --short HEAD 2>/dev/null || true)
  [[ "$current" == "$branch" ]] || die "$app_dir está en '$current', se esperaba '$branch'"
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] \
    || die "$app_dir tiene cambios trackeados sin commitear; no deployo encima"

  git fetch --quiet origin "$branch"
  local target="${sha:-origin/$branch}"
  git cat-file -e "$target^{commit}" 2>/dev/null || die "No encuentro el commit $target"
  git merge-base --is-ancestor "$target" "origin/$branch" \
    || die "$target no pertenece a origin/$branch"
  git merge --ff-only "$target"
  local deployed_sha
  deployed_sha=$(git rev-parse --short HEAD)
  git log --oneline -1
  endgroup

  # El override necesita el archivo del commit que se acaba de traer.
  [[ -f "deploy/vps/compose.$env_name.yml" ]] || die "Falta deploy/vps/compose.$env_name.yml"

  local app_host project
  app_host=$(sed -n 's/^APP_HOST=//p' .env | tail -n1 | tr -d "\"'")
  [[ -n "$app_host" ]] || die "APP_HOST no está definido en $app_dir/.env"
  project=$("${dc[@]}" config | sed -n 's/^name: //p' | head -n1)
  [[ -n "$project" ]] || die "No pude resolver el nombre del proyecto compose"
  local base_url="https://$app_host"

  # ── 2. Rollback point ──
  # Se toma la imagen del contenedor en ejecución y no :latest: si un deploy
  # anterior cortó después del build, :latest apunta a algo que nunca salió.
  group "Tag de las imágenes en ejecución como :previous"
  local svc cid
  for svc in backend frontend; do
    cid=$("${dc[@]}" ps -q "$svc" 2>/dev/null | head -n1 || true)
    if [[ -n "$cid" ]]; then
      docker image tag "$(docker inspect -f '{{.Image}}' "$cid")" "$project-$svc:previous"
      echo "imagen en ejecución de $svc → $project-$svc:previous"
    elif docker image inspect "$project-$svc:latest" >/dev/null 2>&1; then
      docker image tag "$project-$svc:latest" "$project-$svc:previous"
      echo "$project-$svc:latest → :previous"
    else
      echo "$project-$svc:latest no existe todavía (primer deploy)"
    fi
  done
  endgroup

  # ── 3. Build (los contenedores viejos siguen sirviendo) ──
  group "Build backend + frontend"
  "${dc[@]}" build backend frontend
  endgroup

  # ── 4. Backup (solo prod) ──
  if [[ "$env_name" == "prod" ]]; then
    group "Backup de la DB antes de migrar ($backup_script)"
    "$backup_script" || die "El backup falló; no se levantó la versión nueva"
    endgroup
  fi

  # ── 5. Up ──
  group "Levantar la versión nueva"
  "${dc[@]}" up -d --no-build
  "${dc[@]}" ps
  endgroup

  # ── 6. Healthcheck ──
  group "Healthcheck $base_url"
  local timeout="${HEALTH_TIMEOUT:-300}" deadline fe_ok=false api_ok=false
  deadline=$((SECONDS + timeout))
  while ((SECONDS < deadline)); do
    http_is "$base_url/" 200 && fe_ok=true || fe_ok=false
    # Sin token el backend responde 401: prueba que Nest levantó y enruta.
    http_is "$base_url/api/geo/provinces" 401 && api_ok=true || api_ok=false
    $fe_ok && $api_ok && break
    echo "frontend=$fe_ok api=$api_ok — reintento en 5s"
    sleep 5
  done
  endgroup

  if ! $fe_ok || ! $api_ok; then
    group "Logs (healthcheck falló)"
    "${dc[@]}" ps || true
    "${dc[@]}" logs --no-color --tail=150 backend frontend || true
    endgroup
    summary "### ❌ Deploy a $env_name ($deployed_sha): healthcheck falló"
    summary "- frontend \`/\` → 200: $fe_ok"
    summary "- API \`/api/geo/provinces\` → 401: $api_ok"
    summary "- Rollback: ver docs/deployment.md § Rollback"
    die "Healthcheck falló tras ${timeout}s (frontend=$fe_ok api=$api_ok)"
  fi

  # ── 6b. Smoke test del módulo trips (solo lectura) ──
  # La cuenta de smoke es opcional y sale del .env del entorno (SMOKE_EMAIL /
  # SMOKE_PASSWORD); sin ella corren solo los checks sin autenticación.
  group "Smoke test trips"
  local smoke_ok=true
  (
    set -a
    # shellcheck disable=SC1090
    source <(grep -E '^(SMOKE_(EMAIL|PASSWORD)|E2E_PASSWORD)=' .env || true)
    set +a
    # Sin cuenta de smoke propia, usa la del transportista del E2E (dev).
    if [[ -z "${SMOKE_EMAIL:-}" && -n "${E2E_PASSWORD:-}" ]]; then
      export SMOKE_EMAIL=e2e-carrier@cargolink.test SMOKE_PASSWORD="$E2E_PASSWORD"
    fi
    bash "$script_dir/smoke.sh" "$base_url"
  ) || smoke_ok=false
  endgroup
  $smoke_ok || die "El smoke test post-deploy falló; ver el resumen del job y docs/deployment.md § Rollback"

  # ── 6c. E2E del módulo trips (solo dev: escribe datos) ──
  # Corre dentro del contenedor del backend, que ya tiene node y E2E_PASSWORD
  # (el seed creó las cuentas con esa misma password). Pega contra la URL
  # pública, igual que un usuario, y al cerrar el viaje usa OSRM real.
  if [[ "$env_name" == "dev" ]]; then
    group "E2E trips (carga → postulación → viaje → OSRM → calificación)"
    local e2e_out e2e_ok=true
    e2e_out=$(mktemp)
    if grep -qE '^E2E_PASSWORD=.+' .env; then
      "${dc[@]}" exec -T backend node --input-type=module - "$base_url" \
        <"$script_dir/e2e-trips.mjs" 2>&1 | tee "$e2e_out" || e2e_ok=false
      summary "### E2E trips — $base_url"
      summary "$(sed -e 's/^  ok   /- ✅ /' -e 's/^  FAIL /- ❌ /' "$e2e_out")"
    else
      echo "  skip E2E (sin E2E_PASSWORD en .env)"
      summary "- ⏭️ E2E trips omitido (sin E2E_PASSWORD en .env)"
    fi
    rm -f "$e2e_out"
    endgroup
    $e2e_ok || die "El E2E post-deploy falló; ver el resumen del job"
  fi

  # ── 7. Limpieza ──
  group "Limpieza de imágenes huérfanas y build cache viejo"
  docker image prune -f || true
  docker builder prune -f --filter until=168h || true
  endgroup

  summary "### ✅ Deploy a $env_name ($deployed_sha)"
  summary "- $base_url"
  log "Deploy a $env_name OK ($deployed_sha) — $base_url"
}

# Todo el script vive en main() para que bash lo parsee completo antes de
# correr: el `git merge` puede reemplazar este mismo archivo durante el deploy.
main "$@"
