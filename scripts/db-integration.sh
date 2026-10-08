#!/usr/bin/env bash
#
# MODALIS — the database path end to end: real Postgres, real PostgREST, the real repositories.
#
#   bash scripts/db-integration.sh
#
# 1. starts the throwaway cluster from supabase/scripts/db-local.sh and applies every migration
# 2. downloads PostgREST once (into .cache/, git-ignored) and serves the schema under /rest/v1,
#    the prefix supabase-js expects
# 3. signs a short-lived service-role key with a random secret made for this run only
# 4. runs packages/domain/test-integration, then stops PostgREST (the cluster is left up; stop it
#    with `pnpm db:down`)
#
# Nothing here touches a hosted database or needs a credential.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PGRST_VERSION="12.2.3"
CACHE="$ROOT/.cache/postgrest"
RUN="$(mktemp -d)"
PGRST_PORT="${MODALIS_PGRST_PORT:-3001}"
PROXY_PORT="${MODALIS_PROXY_PORT:-54321}"
PIDS=()

cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  rm -rf "$RUN"
}
trap cleanup EXIT

say() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

say "Postgres with every migration applied"
bash supabase/scripts/db-local.sh reset >/dev/null

if [ ! -x "$CACHE/postgrest" ]; then
  say "Downloading PostgREST v$PGRST_VERSION"
  mkdir -p "$CACHE"
  curl -fsSL -o "$CACHE/pgrst.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/v$PGRST_VERSION/postgrest-v$PGRST_VERSION-linux-static-x64.tar.xz"
  tar -xJf "$CACHE/pgrst.tar.xz" -C "$CACHE"
  rm -f "$CACHE/pgrst.tar.xz"
fi

say "PostgREST on :$PGRST_PORT, /rest/v1 on :$PROXY_PORT"
SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
cat >"$RUN/pgrst.conf" <<EOF
db-uri = "postgresql://postgres@/${MODALIS_PGDB:-modalis}?host=${MODALIS_PGSOCK:-/tmp/modalis-pg}&port=${MODALIS_PGPORT:-5433}"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-host = "127.0.0.1"
server-port = $PGRST_PORT
EOF
"$CACHE/postgrest" "$RUN/pgrst.conf" >"$RUN/pgrst.log" 2>&1 &
PIDS+=($!)

PGRST_PORT="$PGRST_PORT" PROXY_PORT="$PROXY_PORT" node -e '
const http = require("http");
const up = Number(process.env.PGRST_PORT);
http.createServer((req, res) => {
  const path = req.url.replace(/^\/rest\/v1/, "") || "/";
  const r = http.request({ host: "127.0.0.1", port: up, path, method: req.method,
    headers: { ...req.headers, host: "127.0.0.1:" + up } }, (u) => { res.writeHead(u.statusCode, u.headers); u.pipe(res); });
  r.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(r);
}).listen(Number(process.env.PROXY_PORT), "127.0.0.1");
' &
PIDS+=($!)

# A service-role JWT valid for one hour, signed with this run's secret.
KEY="$(SECRET="$SECRET" node -e '
const c = require("crypto");
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const body = b({ alg: "HS256", typ: "JWT" }) + "." + b({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 });
console.log(body + "." + c.createHmac("sha256", process.env.SECRET).update(body).digest("base64url"));
')"

for _ in $(seq 1 40); do
  curl -fs "http://127.0.0.1:$PROXY_PORT/rest/v1/" -H "Authorization: Bearer $KEY" >/dev/null 2>&1 && break
  sleep 0.25
done

say "Integration test"
cd packages/domain
MODALIS_IT_URL="http://127.0.0.1:$PROXY_PORT" MODALIS_IT_SERVICE_KEY="$KEY" \
  node --experimental-strip-types --test test-integration/db.integration.ts
