#!/usr/bin/env bash
# Corre la prueba de carga de tracking contra el stack local de docker compose.
#
#   tests/k6/run-local.sh [stress|soak|quick]
#
# Requiere `docker compose up -d` con el backend buildeado desde este código
# (el fixture viaja compilado en la imagen: dist/prisma/k6-fixture.js).
# Variables opcionales: MAX_VUS, SOAK_DURATION.

set -Eeuo pipefail

profile="${1:-stress}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
mkdir -p k6-results

# El fixture corre dentro del contenedor para usar la DB de compose (y no un
# Postgres que pueda estar escuchando en el 5432 del host).
trip_id=$(docker compose exec -T backend node dist/prisma/k6-fixture.js)
echo "Viaje de prueba: $trip_id"

MSYS_NO_PATHCONV=1 docker run --rm -i \
  -v "$root/k6-results:/out" \
  --add-host host.docker.internal:host-gateway \
  -e BASE_URL=http://host.docker.internal:3001/api \
  -e TRIP_ID="$trip_id" -e PROFILE="$profile" \
  -e MAX_VUS="${MAX_VUS:-}" -e SOAK_DURATION="${SOAK_DURATION:-}" \
  grafana/k6:0.54.0 run \
  --summary-trend-stats "avg,min,med,max,p(90),p(95),p(99)" \
  --summary-export "/out/$profile.json" \
  - <tests/k6/trips-location.js

node .github/scripts/k6-summary.js "k6-results/$profile.json"
