#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres container and runs the schema assertions.
# Catches SQL errors before they reach the real project. Needs Docker running; nothing persists.
#
#   ./scripts/dryrun/run.sh
set -euo pipefail

CONTAINER=ahd-schema-dryrun
IMAGE=postgres:17-alpine
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=dryrun -e POSTGRES_DB=dryrun "$IMAGE" >/dev/null

printf 'Đang chờ Postgres khởi động'
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d dryrun >/dev/null 2>&1; then break; fi
  printf '.'
  sleep 1
done
echo

run_sql() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d dryrun < "$1"
}

echo "→ bootstrap (auth schema, roles)"
run_sql "$ROOT/scripts/dryrun/00_bootstrap.sql"

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$migration")"
  run_sql "$migration"
done

echo "→ assertions"
run_sql "$ROOT/scripts/dryrun/99_assert.sql"
