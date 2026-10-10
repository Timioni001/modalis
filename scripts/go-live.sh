#!/usr/bin/env bash
#
# MODALIS — take the project live on Monad testnet in one pass.
#
#   cp scripts/golive.env.example .env.golive    # once, then fill it in
#   bash scripts/go-live.sh
#
# In order, stopping at the first problem with the fix printed:
#   1. checks the tools (Node 22+, pnpm, Foundry, psql, Vercel CLI)
#   2. installs dependencies exactly as locked and runs the test suites
#   3. applies the database migrations to Supabase
#   4. deploys the contracts to Monad testnet, unless a live deployment already exists
#   5. optionally sends demo tokens to your wallet
#   6. writes every environment variable to Vercel and deploys to production
#   7. checks the live site
#
# Safe to run again: migrations are idempotent, an existing deployment is reused, and Vercel
# variables are replaced rather than duplicated. Secrets are read from .env.golive and are never
# printed.
#
# Flags (environment): SKIP_TESTS=1  FORCE_REDEPLOY=1  SKIP_VERCEL=1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[0;32m✓\033[0m %s\n' "$1"; }
note() { printf '    \033[0;33m•\033[0m %s\n' "$1"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$1" >&2; shift; for l in "$@"; do printf '    %s\n' "$l" >&2; done; exit 1; }

# ------------------------------------------------------------------------------ settings
step "Reading .env.golive"
[ -f .env.golive ] || die "No .env.golive found." \
  "cp scripts/golive.env.example .env.golive" \
  "nano .env.golive        # fill it in, then run this again"
# Windows editors save CRLF line endings, which would end up inside every value.
sed -i 's/\r$//' .env.golive
# Anything set on the command line (SITE_URL=... bash scripts/go-live.sh) wins over the file, even
# when the file has the same name with an empty value.
PRESET="$(export -p)"
set -a
# shellcheck disable=SC1091
. ./.env.golive
set +a
eval "$PRESET"
ok "loaded"

CHAIN_ID=10143
RPC="${MONAD_TESTNET_RPC_URL:-https://testnet-rpc.monad.xyz}"

# ------------------------------------------------------------------------------ 1. tools
step "1/7  Tools"
command -v node >/dev/null || die "Node.js is missing." \
  "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -" "sudo apt-get install -y nodejs"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || die "Node 22+ is required (found $(node -v))." \
  "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -" "sudo apt-get install -y nodejs"
ok "node $(node -v)"
command -v pnpm >/dev/null || die "pnpm is missing." "sudo corepack enable && corepack prepare pnpm@10 --activate"
ok "pnpm $(pnpm -v)"
command -v forge >/dev/null && command -v cast >/dev/null || die "Foundry is missing." \
  "curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup"
ok "$(forge --version | head -1)"
if [ -n "${SUPABASE_DB_URL:-}" ]; then
  command -v psql >/dev/null || die "psql is missing (needed for the migrations)." "sudo apt-get install -y postgresql-client"
  ok "psql"
fi
if [ "${SKIP_VERCEL:-0}" != "1" ]; then
  command -v vercel >/dev/null || die "The Vercel CLI is missing." "npm i -g vercel" "vercel login" \
    "vercel link    # run from the repository root; Root Directory = apps/web"
  [ -f .vercel/project.json ] || die "This folder is not linked to your Vercel project." \
    "vercel link    # from $ROOT; pick your existing project; Root Directory = apps/web"
  ok "vercel CLI, project linked"
fi

# ------------------------------------------------------------------------------ 2. build
step "2/7  Install and test"
pnpm install --frozen-lockfile >/tmp/modalis-install.log 2>&1 || { tail -20 /tmp/modalis-install.log; die "pnpm install failed (log above)."; }
ok "dependencies installed"
# The Solidity libraries are not stored in git; fetch the pinned versions once.
[ -d contracts/lib/forge-std ] || git clone --quiet --depth 1 --branch v1.11.0 \
  https://github.com/foundry-rs/forge-std.git contracts/lib/forge-std
[ -d contracts/lib/openzeppelin-contracts ] || git clone --quiet --depth 1 --branch v5.4.0 \
  https://github.com/OpenZeppelin/openzeppelin-contracts.git contracts/lib/openzeppelin-contracts
(cd contracts && forge build >/tmp/modalis-forge.log 2>&1) || { tail -20 /tmp/modalis-forge.log; die "Contracts did not compile (log above)." "rm -rf contracts/lib && bash scripts/go-live.sh   # refetch the libraries"; }
ok "contracts compile"
if [ "${SKIP_TESTS:-0}" != "1" ]; then
  pnpm -r test >/tmp/modalis-test.log 2>&1 || { grep -E 'not ok|fail [1-9]' /tmp/modalis-test.log | head -20; die "Tests failed. Full log: /tmp/modalis-test.log"; }
  (cd contracts && forge test >/tmp/modalis-forge-test.log 2>&1) || { tail -20 /tmp/modalis-forge-test.log; die "Contract tests failed."; }
  ok "all tests pass"
else
  note "tests skipped (SKIP_TESTS=1)"
fi

# ------------------------------------------------------------------------------ 3. database
step "3/7  Database migrations"
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  note "SUPABASE_DB_URL is empty — skipping. The app runs, but goals and history won't be saved."
else
  case "$SUPABASE_DB_URL" in
    *@db.*.supabase.co*) die "SUPABASE_DB_URL is the 'Direct connection' string, which is IPv6-only and unreachable from WSL." \
      "Supabase -> Connect -> Connection String -> Method: 'Session pooler'. Copy that one instead." \
      "It looks like: postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" ;;
  esac
  psql "$SUPABASE_DB_URL" -tAc 'select 1' >/dev/null 2>/tmp/modalis-psql.log || {
    sed 's/postgres[^ ]*@/postgres:***@/' /tmp/modalis-psql.log | head -5
    die "Can't connect to Supabase." \
      "Use the 'Session pooler' string from Project -> Connect (WSL has no IPv6 for the direct one)." \
      "Put the database password in place of [YOUR-PASSWORD]; URL-encode @ # / ? in it."
  }
  for f in supabase/migrations/*.sql; do
    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$f" >/tmp/modalis-migrate.log 2>&1 || {
      tail -15 /tmp/modalis-migrate.log; die "Migration $(basename "$f") failed (nothing from that file was applied)."
    }
    ok "$(basename "$f")"
  done
fi

# ------------------------------------------------------------------------------ 4. contracts
step "4/7  Contracts on Monad testnet"
# The local demo (scripts/demo-local.sh) runs anvil with the SAME chain id and overwrites
# contracts/deployments/10143.json with throwaway local addresses. So the real testnet record is
# kept in its own file, and a record is only trusted if it came from a real block and its vault
# has code on the real network.
FILE="contracts/deployments/${CHAIN_ID}.json"
KEEP="contracts/deployments/${CHAIN_ID}.testnet.json"
ANVIL_VAULT="0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0"
trusted() {
  [ -f "$1" ] || return 1
  local block vault code
  block="$(node -p "require('./$1').blockNumber || 0")"
  vault="$(node -p "require('./$1').contracts.portfolioVault.toLowerCase()")"
  [ "$block" != "0" ] && [ "$vault" != "$ANVIL_VAULT" ] || return 1
  code="$(cast code "$vault" --rpc-url "$RPC" 2>/dev/null || echo 0x)"
  [ "${#code}" -gt 4 ]
}
if [ "${FORCE_REDEPLOY:-0}" != "1" ] && trusted "$KEEP"; then
  cp "$KEEP" "$FILE"
  ok "reusing the live deployment (vault $(node -p "require('./$KEEP').contracts.portfolioVault")). FORCE_REDEPLOY=1 to replace it."
else
  [ -n "${DEPLOYER_PRIVATE_KEY:-}" ] || die "DEPLOYER_PRIVATE_KEY is empty in .env.golive." \
    "cast wallet new     # make a testnet-only key" "fund the address at https://faucet.monad.xyz"
  MONAD_TESTNET_RPC_URL="$RPC" bash scripts/deploy-testnet.sh >/tmp/modalis-deploy.log 2>&1 || {
    grep -v -i 'private' /tmp/modalis-deploy.log | tail -25; die "Deployment failed (log above)."
  }
  trusted "$FILE" || die "The deploy ran but the new contracts can't be found on $RPC." "See /tmp/modalis-deploy.log"
  cp "$FILE" "$KEEP"
  ok "deployed; addresses saved to $KEEP"
fi

# ------------------------------------------------------------------------------ 5. demo tokens
step "5/7  Demo tokens"
if [ -n "${FUND_WALLET:-}" ]; then
  MODALIS_RPC_URL="$RPC" DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-}" \
    bash scripts/fund-wallet.sh "$FUND_WALLET" >/tmp/modalis-fund.log 2>&1 \
    && ok "sent demo tokens to $FUND_WALLET" \
    || note "couldn't fund $FUND_WALLET (see /tmp/modalis-fund.log); everything else continues"
else
  note "FUND_WALLET is empty — skipping"
fi

# Optional: live demo controls ("Simulate a market move", "Test my rules") on the testnet site.
# The demo oracle is handed to its own key so the deployer key, which owns everything else, never
# goes to Vercel. That key's only power is writing made-up prices to a demo oracle.
DEMO_LIVE=0
if [ -n "${ORACLE_UPDATER_PRIVATE_KEY:-}" ]; then
  ORACLE="$(node -p "require('./$KEEP').contracts.priceOracle || ''")"
  UPDATER="$(cast wallet address --private-key "$ORACLE_UPDATER_PRIVATE_KEY")"
  OWNER="$(cast call "$ORACLE" 'owner()(address)' --rpc-url "$RPC" 2>/dev/null || true)"
  if [ -z "$ORACLE" ]; then
    note "no demo oracle in $KEEP; live demo controls stay off"
  elif [ "${OWNER,,}" = "${UPDATER,,}" ]; then
    DEMO_LIVE=1; ok "demo oracle already owned by the updater key"
  elif [ -n "${DEPLOYER_PRIVATE_KEY:-}" ] && cast send "$ORACLE" 'transferOwnership(address)' "$UPDATER" \
         --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null 2>&1; then
    DEMO_LIVE=1; ok "demo oracle handed to the updater key $UPDATER"
  else
    note "couldn't hand the demo oracle to $UPDATER (owner is $OWNER); live demo controls stay off"
  fi
  # Each price write costs a little gas; top the updater up from the deployer when it runs low.
  if [ "$DEMO_LIVE" = "1" ] && awk -v b="$(cast balance "$UPDATER" --ether --rpc-url "$RPC" 2>/dev/null || echo 0)" 'BEGIN{exit !(b < 0.05)}'; then
    { [ -n "${DEPLOYER_PRIVATE_KEY:-}" ] && cast send "$UPDATER" --value 0.2ether \
        --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null 2>&1 && ok "sent 0.2 MON to the updater key"; } \
      || note "fund $UPDATER with a little MON at https://faucet.monad.xyz"
  fi
fi

# ------------------------------------------------------------------------------ 6. vercel
step "6/7  Vercel environment and deploy"
[ -n "${NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID:-}" ] || note "NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is empty: the site will work, but nobody can sign in until it is set."
ENVFILE="$(mktemp)"
trap 'rm -f "$ENVFILE"' EXIT
node -e '
const d = require("./'"$KEEP"'");
const ZERO = "0x0000000000000000000000000000000000000000";
const map = {
  assetRegistry: "NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS", portfolioMandate: "NEXT_PUBLIC_PORTFOLIO_MANDATE_ADDRESS",
  portfolioVault: "NEXT_PUBLIC_PORTFOLIO_VAULT_ADDRESS", rebalanceExecutor: "NEXT_PUBLIC_REBALANCE_EXECUTOR_ADDRESS",
  riskSignalReceiver: "NEXT_PUBLIC_RISK_SIGNAL_RECEIVER_ADDRESS", priceOracle: "NEXT_PUBLIC_PRICE_ORACLE_ADDRESS",
  executionAdapter: "NEXT_PUBLIC_EXECUTION_ADAPTER_ADDRESS", kuruAdapter: "NEXT_PUBLIC_KURU_ADAPTER_ADDRESS",
  savingsCircle: "NEXT_PUBLIC_SAVINGS_CIRCLE_ADDRESS",
  mUSD: "NEXT_PUBLIC_MUSD_ADDRESS", mBTC: "NEXT_PUBLIC_MBTC_ADDRESS", mETH: "NEXT_PUBLIC_METH_ADDRESS", mBOND: "NEXT_PUBLIC_MBOND_ADDRESS",
};
const all = { ...d.contracts, ...d.tokens };
for (const [k, e] of Object.entries(map)) if (all[k] && all[k].toLowerCase() !== ZERO) console.log(e + "=" + all[k]);
' >"$ENVFILE"
{
  echo "NEXT_PUBLIC_MONAD_CHAIN_ID=$CHAIN_ID"
  echo "MODALIS_NETWORK=testnet"
  [ -n "${MONAD_TESTNET_RPC_URL:-}" ] && echo "MONAD_TESTNET_RPC_URL=$MONAD_TESTNET_RPC_URL"
  for k in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY \
           NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID MANAGER_PRIVATE_KEY FAUCET_PRIVATE_KEY \
           AI_API_KEY AI_MODEL AI_BASE_URL ENVIO_GRAPHQL_URL SENTRY_DSN \
           DYNAMIC_API_TOKEN DYNAMIC_AGENT_WALLET DYNAMIC_AGENT_PASSWORD; do
    v="${!k:-}"; [ -n "$v" ] && echo "$k=$v"
  done
  if [ "$DEMO_LIVE" = "1" ]; then
    echo "ORACLE_UPDATER_PRIVATE_KEY=$ORACLE_UPDATER_PRIVATE_KEY"
    echo "DEMO_MODE=true"
    echo "NEXT_PUBLIC_DEMO_MODE=true"
  fi
  # A fresh metrics token on the first run only; afterwards the one in Vercel is kept.
  echo "OPS_METRICS_TOKEN=${OPS_METRICS_TOKEN:-$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')}"
} >>"$ENVFILE"

if [ "${SKIP_VERCEL:-0}" = "1" ]; then
  note "SKIP_VERCEL=1 — these variable NAMES would be set (values hidden):"
  cut -d= -f1 "$ENVFILE" | sed 's/^/      /'
else
  # Variables that must never reach production, in case an earlier experiment set them.
  STRIP="MODALIS_DEV_AUTH NEXT_PUBLIC_DEV_WALLET MONAD_RPC_URL SUPABASE_URL"
  [ "$DEMO_LIVE" = "1" ] || STRIP="$STRIP DEMO_MODE NEXT_PUBLIC_DEMO_MODE ORACLE_UPDATER_PRIVATE_KEY"
  for k in $STRIP; do
    vercel env rm "$k" production -y >/dev/null 2>&1 || true
  done
  while IFS= read -r line; do
    k="${line%%=*}"; v="${line#*=}"
    [ "$k" = "OPS_METRICS_TOKEN" ] && vercel env ls production 2>/dev/null | grep -q "OPS_METRICS_TOKEN" && continue
    vercel env rm "$k" production -y >/dev/null 2>&1 || true
    printf '%s' "$v" | vercel env add "$k" production >/dev/null 2>&1 || die "Couldn't set $k in Vercel." "vercel whoami   # are you logged in to the right account?"
    ok "$k"
  done <"$ENVFILE"
  step "Deploying to production (takes 2–4 minutes)"
  URL="$(vercel deploy --prod --yes 2>/tmp/modalis-vercel.log | tail -1)" || { tail -30 /tmp/modalis-vercel.log; die "Vercel deploy failed (log above)."; }
  ok "deployed: $URL"
  SITE_URL="${SITE_URL:-$URL}"
fi

# ------------------------------------------------------------------------------ 7. check
step "7/7  Live check"
if [ -z "${SITE_URL:-}" ]; then
  note "set SITE_URL in .env.golive to check the live site"
else
  status="$(curl -fsS -m 30 "$SITE_URL/api/status" || true)"
  [ -n "$status" ] || die "$SITE_URL/api/status did not answer." "Open it in a browser; check the Vercel build log."
  # Per-deployment URLs sit behind Vercel's login; only the public domain answers with JSON.
  case "$status" in
    \{*) ;;
    *) note "$SITE_URL is behind Vercel's login. Put your public domain in SITE_URL (e.g. https://modalis-six.vercel.app) to check it."
       printf '\n\033[1;32mDeployed.\033[0m\n'; exit 0 ;;
  esac
  printf '%s' "$status" | node -e '
    let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
      const j = JSON.parse(s);
      const line = (good, text) => console.log(`    ${good ? "\x1b[32m✓\x1b[0m" : "\x1b[33m•\x1b[0m"} ${text}`);
      line(j.network?.reachable, `network: ${j.network?.name} (block ${j.network?.blockNumber ?? "?"})`);
      line(j.ready, j.ready ? "contracts found" : "contracts NOT found — check the NEXT_PUBLIC_*_ADDRESS variables");
      line(j.signIn?.configured, j.signIn?.configured ? "sign-in configured" : "sign-in not configured (NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID)");
      line(j.poweredBy?.savedData, j.poweredBy?.savedData ? "database connected" : "database not connected");
      if (j.signIn?.developmentBypassEnabled) console.log("    \x1b[31m✗ MODALIS_DEV_AUTH is on in production — remove it\x1b[0m");
    });'
fi

printf '\n\033[1;32mDone.\033[0m Open %s and sign in.\n' "${SITE_URL:-your site}"
