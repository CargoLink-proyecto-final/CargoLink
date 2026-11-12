#!/usr/bin/env bash
# Smoke test post-deploy del módulo de viajes (trips).
#
#   deploy/vps/smoke.sh <base_url>
#   deploy/vps/smoke.sh https://dev.cargolink.com.ar
#
# Lo corre deploy.sh después del healthcheck, y también sirve a mano. Es solo
# lectura: no crea ni modifica datos, así que es seguro contra prod.
#
# Sin credenciales verifica que las rutas estén montadas y protegidas. Con
# SMOKE_EMAIL y SMOKE_PASSWORD (una cuenta TRANSPORTER) además entra y
# consulta sus viajes y métricas.

set -Euo pipefail

base_url="${1:-}"
[[ -n "$base_url" ]] || { echo "Uso: $0 <base_url>" >&2; exit 2; }
base_url="${base_url%/}"

failures=0

summary() { [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && echo "$*" >>"$GITHUB_STEP_SUMMARY" || true; }

# check <descripción> <código esperado> <curl args...>
check() {
  local name="$1" expected="$2" code
  shift 2
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" || true)
  if [[ "$code" == "$expected" ]]; then
    echo "  ok   $name ($code)"
    summary "- ✅ $name"
  else
    echo "  FAIL $name (esperaba $expected, vino $code)"
    summary "- ❌ $name: esperaba $expected, vino $code"
    failures=$((failures + 1))
  fi
}

summary "### Smoke test trips — $base_url"
echo "Smoke test trips contra $base_url"

check "frontend /trips responde" 200 -L "$base_url/trips"
check "GET /api/trips/my exige token" 401 "$base_url/api/trips/my"
check "GET /api/trips/metrics exige token" 401 "$base_url/api/trips/metrics"
check "PATCH /api/trips/:id/location exige token" 401 -X PATCH \
  -H 'Content-Type: application/json' -d '{"lat":0,"lng":0}' \
  "$base_url/api/trips/smoke/location"

if [[ -n "${SMOKE_EMAIL:-}" && -n "${SMOKE_PASSWORD:-}" ]]; then
  # Solo bash + curl: el host del VPS no tiene por qué tener node ni jq.
  # Se escapan \ y " para que la password no rompa el JSON.
  json_escape() { local s="${1//\\/\\\\}"; printf '%s' "${s//\"/\\\"}"; }
  body=$(printf '{"email":"%s","password":"%s"}' \
    "$(json_escape "$SMOKE_EMAIL")" "$(json_escape "$SMOKE_PASSWORD")")
  token=$(
    curl -s --max-time 15 -H 'Content-Type: application/json' --data-binary "$body" \
      "$base_url/api/auth/login" |
      grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4 || true
  )
  if [[ -n "$token" ]]; then
    echo "  ok   login de la cuenta de smoke"
    summary "- ✅ login de la cuenta de smoke"
    check "GET /api/trips/my con token" 200 -H "Authorization: Bearer $token" "$base_url/api/trips/my"
    check "GET /api/trips/metrics con token" 200 -H "Authorization: Bearer $token" "$base_url/api/trips/metrics"
  else
    echo "  FAIL login de la cuenta de smoke"
    summary "- ❌ login de la cuenta de smoke"
    failures=$((failures + 1))
  fi
else
  echo "  skip checks autenticados (sin SMOKE_EMAIL/SMOKE_PASSWORD)"
  summary "- ⏭️ checks autenticados omitidos (sin SMOKE_EMAIL/SMOKE_PASSWORD)"
fi

if ((failures > 0)); then
  echo "Smoke test: $failures check(s) fallaron"
  exit 1
fi
echo "Smoke test OK"
