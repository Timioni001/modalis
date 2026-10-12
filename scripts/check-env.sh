#!/usr/bin/env bash
#
# MODALIS — what your Vercel production environment has, and what each missing value would add.
#
#   bash scripts/check-env.sh
#
# Read-only: it pulls the variable NAMES from Vercel and compares them against the full list this
# codebase reads. It never prints a value, and never changes anything.
#
# Use it when you set variables in the Vercel dashboard rather than in .env.golive. Both work —
# go-live.sh only writes variables it has a value for, so anything you set by hand in Vercel is
# left alone on later runs.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf '\n\033[1;34m==> %s\033[0m\n'   "$1"; }
have() { printf '    \033[0;32m✓\033[0m %-36s %s\n' "$1" "$2"; }
miss() { printf '    \033[0;33m•\033[0m %-36s %s\n' "$1" "$2"; }
bad()  { printf '    \033[0;31m✗\033[0m %-36s %s\n' "$1" "$2"; }

command -v vercel >/dev/null || { echo "The Vercel CLI is missing: npm i -g vercel" >&2; exit 1; }
[ -f .vercel/project.json ] || { echo "Not linked to a Vercel project: run 'vercel link' here." >&2; exit 1; }

PULLED="$(mktemp)"
trap 'rm -f "$PULLED"' EXIT

# Every environment, not just production. A development-only MODALIS_DEV_AUTH is low risk, but a
# preview deploy is a public URL, so a sign-in bypass or DEMO_MODE there is a real hole.
NAMES=""; PROD_NAMES=""
for envname in production preview development; do
  if vercel env pull "$PULLED" --environment="$envname" --yes >/tmp/modalis-envpull.log 2>&1; then
    got="$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$PULLED" | tr -d '=' | sort -u)"
    : >"$PULLED"   # names only; values are never kept
    printf '    %-12s %s variables\n' "$envname" "$(printf '%s\n' "$got" | grep -c . || echo 0)"
    NAMES="$NAMES
$(printf '%s\n' "$got" | sed "s/\$/|$envname/")"
    [ "$envname" = "production" ] && PROD_NAMES="$got"
  else
    printf '    %-12s could not read\n' "$envname"
  fi
done
[ -n "$PROD_NAMES" ] || { echo "Couldn't read production. Are you logged in?  vercel whoami" >&2; exit 1; }

set_in_vercel() { printf '%s\n' "$PROD_NAMES" | grep -qx "$1"; }
# Which environments a name appears in, e.g. "production preview"
envs_of() { printf '%s\n' "$NAMES" | grep "^$1|" | cut -d'|' -f2 | tr '\n' ' '; }

report() { if set_in_vercel "$1"; then have "$1" "$2"; else miss "$1" "$2"; fi; }

say "Required — the product does not work without these"
for pair in \
  "NEXT_PUBLIC_MONAD_CHAIN_ID|Which network. 10143 is Monad testnet" \
  "NEXT_PUBLIC_PORTFOLIO_VAULT_ADDRESS|Where your money is held" \
  "NEXT_PUBLIC_PORTFOLIO_MANDATE_ADDRESS|Where your limits are held" \
  "NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS|Which investments are allowed" \
  "NEXT_PUBLIC_REBALANCE_EXECUTOR_ADDRESS|Carries out approved adjustments" \
  "NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID|Sign-in. Without it nobody can log in"; do
  name="${pair%%|*}"; desc="${pair#*|}"
  if set_in_vercel "$name"; then have "$name" "$desc"; else bad "$name" "$desc"; fi
done

say "Saved data — goals, plan history, notifications"
report NEXT_PUBLIC_SUPABASE_URL      "Your Supabase project URL"
report NEXT_PUBLIC_SUPABASE_ANON_KEY "Supabase anon key (safe in the browser)"
report SUPABASE_SERVICE_ROLE_KEY     "Supabase service_role key. Server only — never NEXT_PUBLIC_"

say "Optional — each one switches on a feature"
report MANAGER_PRIVATE_KEY   "Carries out adjustments people approve"
report DYNAMIC_API_TOKEN     "Same, from a Dynamic server wallet (preferred)"
report DYNAMIC_AGENT_WALLET  "The server wallet itself, from 'pnpm agent:create'"
report FAUCET_PRIVATE_KEY    "'Get test money' works without sending people to a faucet"
report AI_API_KEY            "Typed goals ('a house in 5 years') are understood"
report AI_BASE_URL           "Use an OpenAI-compatible provider instead of Anthropic"
report AI_MODEL              "Which model. Required when AI_BASE_URL is set"
report ENVIO_GRAPHQL_URL     "Activity history from the indexer instead of chain logs"
report SENTRY_DSN            "Server errors reported to Sentry, with secrets scrubbed"
report MONAD_TESTNET_RPC_URL "Your own RPC endpoint instead of the shared public one"
report NEXT_PUBLIC_SITE_URL  "Correct links in share previews and robots.txt"
report OPS_METRICS_TOKEN     "/api/ops/metrics answers instead of returning 404"

say "Must NOT be set — in any environment"
DANGER=0
for pair in \
  "MODALIS_DEV_AUTH|a sign-in bypass: any request can claim to be any wallet" \
  "NEXT_PUBLIC_DEV_WALLET|pins every visitor's browser to one wallet" \
  "DEMO_MODE|exposes the demo and security-test endpoints" \
  "NEXT_PUBLIC_DEMO_MODE|same, in the browser" \
  "DEPLOYER_PRIVATE_KEY|owns every contract. It must never reach a web host" \
  "SUPABASE_DB_URL|full database access that bypasses row-level security. The app never reads it"; do
  name="${pair%%|*}"; desc="${pair#*|}"
  where="$(envs_of "$name")"
  if [ -n "$where" ]; then bad "$name" "$desc  [$where] — REMOVE"; DANGER=1; fi
done
[ "$DANGER" = "0" ] && printf '    \033[0;32m✓\033[0m none of them are set anywhere\n'

say "Set in Vercel, but the app never reads them"
printf '    These are used by scripts on your own machine, from .env.golive. Harmless here, but\n'
printf '    they are clutter and make it look as though a feature is on when it is not.\n'
CLUTTER=0
for pair in \
  "SITE_URL|go-live.sh uses it locally. The app reads NEXT_PUBLIC_SITE_URL" \
  "CRE_FORWARDER_ADDRESS|add-integrations.sh uses it locally, to deploy the receiver" \
  "KURU_ROUTER_ADDRESS|add-integrations.sh uses it locally, to deploy the adapter" \
  "KURU_MARKET_ADDRESSES|add-integrations.sh uses it locally"; do
  name="${pair%%|*}"; desc="${pair#*|}"
  where="$(envs_of "$name")"
  if [ -n "$where" ]; then miss "$name" "$desc  [$where]"; CLUTTER=1; fi
done
[ "$CLUTTER" = "0" ] && printf '    \033[0;32m✓\033[0m none found\n'

say "Names that look like a typo"
TYPOS=0
for pair in \
  "SUPABASE_URL|the app reads NEXT_PUBLIC_SUPABASE_URL" \
  "SUPABASE_ANON_KEY|the app reads NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  "MONAD_RPC_URL|the app reads MONAD_TESTNET_RPC_URL" \
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|a service key must never be NEXT_PUBLIC_"; do
  name="${pair%%|*}"; desc="${pair#*|}"
  if set_in_vercel "$name"; then bad "$name" "ignored — $desc"; TYPOS=1; fi
done
[ "$TYPOS" = "0" ] && printf '    \033[0;32m✓\033[0m none found\n'

printf '\nAfter changing anything in the Vercel dashboard, redeploy for it to take effect:\n'
printf '  vercel deploy --prod --yes      # or: SKIP_TESTS=1 bash scripts/go-live.sh\n\n'
printf 'Live truth, any time: %s\n' "${SITE_URL:-https://your-site}/api/status"
