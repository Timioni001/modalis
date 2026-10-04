#!/usr/bin/env bash
#
# MODALIS — a local Postgres that behaves enough like Supabase to develop and verify against.
#
#   bash scripts/db-local.sh up      start it, apply the schema, verify RLS
#   bash scripts/db-local.sh check   re-run the RLS checks
#   bash scripts/db-local.sh psql    open a shell
#   bash scripts/db-local.sh down    stop it
#   bash scripts/db-local.sh reset   wipe and recreate
#
# This is for development. Production is a real Supabase project, where `auth.jwt()` and the
# anon / authenticated / service_role roles already exist and the shim is NOT applied.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-5433}"
PGUSER_LOCAL="${PGUSER_LOCAL:-$(id -un)}"
PGDATA="${PGDATA:-$HOME/.modalis-pgdata}"
DB="${PGDATABASE:-modalis}"
URL="postgresql://${PGUSER_LOCAL}@127.0.0.1:${PGPORT}/${DB}"

if [ ! -x "$PGBIN/pg_ctl" ]; then
  echo "Postgres server binaries not found at $PGBIN."
  echo "On Ubuntu/WSL:  sudo apt-get install -y postgresql-16"
  echo "Then re-run, or set PGBIN to your install."
  exit 1
fi

start() {
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "==> initdb $PGDATA"
    "$PGBIN/initdb" -D "$PGDATA" -U "$PGUSER_LOCAL" --auth=trust >/dev/null
  fi
  if ! "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
    echo "==> starting postgres on port $PGPORT"
    "$PGBIN/pg_ctl" -D "$PGDATA" \
      -o "-k /tmp -p $PGPORT -c listen_addresses=127.0.0.1" \
      -l "$PGDATA/server.log" start >/dev/null
    sleep 2
  fi
  "$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER_LOCAL" "$DB" 2>/dev/null || true
}

migrate() {
  echo "==> applying the Supabase shim (local only)"
  psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/local/00_supabase_shim.sql
  echo "==> applying supabase/migrations/0001_init.sql"
  psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init.sql
}

check() {
  echo "==> verifying row-level security"
  psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/local/01_rls_check.sql
}

case "${1:-up}" in
  up)
    start; migrate; check
    echo
    echo "Postgres is up. Point the app at it with:"
    echo "  export SUPABASE_DB_URL='$URL'"
    ;;
  check) check ;;
  psql)  exec psql "$URL" ;;
  down)
    "$PGBIN/pg_ctl" -D "$PGDATA" stop >/dev/null 2>&1 || true
    echo "stopped"
    ;;
  reset)
    "$PGBIN/pg_ctl" -D "$PGDATA" stop >/dev/null 2>&1 || true
    rm -rf "$PGDATA"
    start; migrate; check
    ;;
  url) echo "$URL" ;;
  *) echo "usage: $0 {up|check|psql|down|reset|url}"; exit 2 ;;
esac
