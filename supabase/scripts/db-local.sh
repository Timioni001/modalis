#!/usr/bin/env bash
#
# MODALIS — the database schema and its row-level security, against a REAL Postgres.
#
#   bash supabase/scripts/db-local.sh up      # start a throwaway cluster and apply the schema
#   bash supabase/scripts/db-local.sh check   # run the adversarial row-level security checks
#   bash supabase/scripts/db-local.sh psql    # open a shell on it
#   bash supabase/scripts/db-local.sh url     # print the connection string
#   bash supabase/scripts/db-local.sh reset   # drop and reapply the schema
#   bash supabase/scripts/db-local.sh down    # stop the cluster
#
# Why a local cluster rather than a hosted Supabase project: the schema and the row-level security
# policies are the part that can be wrong in a way nothing else catches, and they are ordinary
# Postgres. `local/00_supabase_shim.sql` recreates the few things Supabase adds — `auth.jwt()` and
# the anon / authenticated / service_role roles — so the policies run exactly as they will there.
#
# Ubuntu / WSL2. Needs the postgresql client and server packages; nothing else.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Postgres refuses to run as root, on purpose. If this is being run as root — which it is inside a
# container, and sometimes in WSL — hand the whole thing to the `postgres` system user rather than
# failing with an error about su.
if [ "$(id -u)" = "0" ] && [ "${MODALIS_PG_REEXEC:-}" != "1" ] && id -u postgres >/dev/null 2>&1; then
  export MODALIS_PG_REEXEC=1
  # The cluster and socket live somewhere the postgres user can write, not in the repository.
  export MODALIS_PGDATA="${MODALIS_PGDATA:-/tmp/modalis-pgdata}"
  export MODALIS_PGSOCK="${MODALIS_PGSOCK:-/tmp/modalis-pg}"
  mkdir -p "$MODALIS_PGDATA" "$MODALIS_PGSOCK"
  chown postgres:postgres "$MODALIS_PGDATA" "$MODALIS_PGSOCK"
  exec su postgres -s /bin/bash -c \
    "MODALIS_PG_REEXEC=1 MODALIS_PGDATA='$MODALIS_PGDATA' MODALIS_PGSOCK='$MODALIS_PGSOCK' \
     MODALIS_PGPORT='${MODALIS_PGPORT:-5433}' MODALIS_PGDB='${MODALIS_PGDB:-modalis}' \
     bash '$ROOT/supabase/scripts/db-local.sh' ${1:-up}"
fi

PGDATA="${MODALIS_PGDATA:-$ROOT/.pgdata}"
PGPORT="${MODALIS_PGPORT:-5433}"
PGDB="${MODALIS_PGDB:-modalis}"
PGSOCK="${MODALIS_PGSOCK:-/tmp/modalis-pg}"
LOG="$PGDATA/server.log"

# The server binaries are not on PATH on Debian/Ubuntu.
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
if [ -z "${PGBIN:-}" ]; then
  echo "No PostgreSQL server found. Install it with:" >&2
  echo "  sudo apt-get install -y postgresql postgresql-client" >&2
  exit 1
fi

URL="postgresql://postgres@localhost:${PGPORT}/${PGDB}?host=${PGSOCK}"

say() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

running() {
  "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1
}

start() {
  mkdir -p "$PGSOCK"
  if [ ! -d "$PGDATA/base" ]; then
    say "Creating a throwaway cluster in $PGDATA"
    "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
  fi
  if running; then
    echo "    already running on port $PGPORT"
    return
  fi
  say "Starting Postgres on port $PGPORT"
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOG" \
    -o "-p $PGPORT -k $PGSOCK -c listen_addresses=''" start >/dev/null
  for _ in $(seq 1 20); do
    "$PGBIN/pg_isready" -h "$PGSOCK" -p "$PGPORT" >/dev/null 2>&1 && break
    sleep 0.5
  done
}

apply_schema() {
  # The migration is re-appliable, so "already exists" notices are expected on a second run and
  # are noise. A real problem still raises a warning or an error, which ON_ERROR_STOP catches.
  local quiet='SET client_min_messages = warning;'
  psql "$URL" -v ON_ERROR_STOP=1 -q -c "$quiet" -f supabase/local/00_supabase_shim.sql
  psql "$URL" -v ON_ERROR_STOP=1 -q -c "$quiet" -f supabase/migrations/0001_init.sql
}

case "${1:-up}" in
  up)
    start
    psql "postgresql://postgres@localhost:${PGPORT}/postgres?host=${PGSOCK}" -q -tAc \
      "SELECT 1 FROM pg_database WHERE datname = '${PGDB}'" | grep -q 1 \
      || psql "postgresql://postgres@localhost:${PGPORT}/postgres?host=${PGSOCK}" -q -c \
        "CREATE DATABASE ${PGDB}"
    say "Applying the shim and the schema"
    if apply_schema; then
      printf '    \033[0;32mschema applied\033[0m\n'
      psql "$URL" -q -tAc \
        "SELECT '    ' || count(*) || ' tables, ' || (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e') || ' enums'
         FROM information_schema.tables WHERE table_schema = 'public'"
      echo
      echo "  $URL"
    else
      printf '    \033[0;31mschema failed\033[0m — see above\n'
      exit 1
    fi
    ;;

  check)
    running || { echo "Not running. Start it with: bash supabase/scripts/db-local.sh up" >&2; exit 1; }
    say "Row-level security checks"
    # Every check in the file raises on failure, so ON_ERROR_STOP makes this a real gate.
    if psql "$URL" -v ON_ERROR_STOP=1 -q -f supabase/local/01_rls_check.sql; then
      printf '\n\033[0;32mAll row-level security checks passed.\033[0m\n'
    else
      printf '\n\033[0;31mRow-level security checks FAILED.\033[0m\n'
      exit 1
    fi
    ;;

  reset)
    running || start
    say "Dropping and reapplying"
    psql "$URL" -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" \
      -c "DROP SCHEMA IF EXISTS auth CASCADE;"
    apply_schema && printf '    \033[0;32mreapplied\033[0m\n'
    ;;

  psql)
    running || start
    exec psql "$URL"
    ;;

  url)
    echo "$URL"
    ;;

  down)
    if running; then
      say "Stopping Postgres"
      "$PGBIN/pg_ctl" -D "$PGDATA" stop >/dev/null
      echo "    stopped (data kept in $PGDATA; delete it to start clean)"
    else
      echo "Not running."
    fi
    ;;

  *)
    sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
