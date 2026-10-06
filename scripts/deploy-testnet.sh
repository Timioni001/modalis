#!/usr/bin/env bash
#
# MODALIS — deploy to Monad testnet, and print what the hosted app needs.
#
#   DEPLOYER_PRIVATE_KEY=0x... bash scripts/deploy-testnet.sh
#
# What it does, in order: checks the key has gas, deploys the protocol, writes
# contracts/deployments/10143.json, and prints the environment variables to paste into Vercel.
#
# Why the env variables matter: contracts/deployments/ is gitignored on purpose, because the file
# normally holds LOCAL anvil addresses and committing it would point a hosted deployment at
# contracts that exist on nobody's chain. packages/chain reads addresses from the environment
# FIRST and only falls back to the file, so a hosted build is configured by the variables below
# and never needs the file at all.
#
# The key is read from the environment and is never written to a file, printed, or committed. Use
# a key that exists only for this testnet.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"

RPC="${MONAD_TESTNET_RPC_URL:-https://testnet-rpc.monad.xyz}"
CHAIN_ID=10143

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  cat <<'MSG'
DEPLOYER_PRIVATE_KEY is not set.

  1. Make a key that is only ever used on this testnet:
       cast wallet new
  2. Fund its address from the Monad testnet faucet:
       https://faucet.monad.xyz
  3. Run this again with the key in the environment:
       DEPLOYER_PRIVATE_KEY=0x... bash scripts/deploy-testnet.sh

Never use a key that holds anything on a live network.
MSG
  exit 1
fi

DEPLOYER="$(cast wallet address "$DEPLOYER_PRIVATE_KEY")"
BALANCE="$(cast balance "$DEPLOYER" --rpc-url "$RPC")"

printf '\n==> Deployer %s\n' "$DEPLOYER"
printf '    balance  %s MON\n' "$(cast from-wei "$BALANCE")"

# Deploying the full set costs well under 0.5 MON, but a balance of zero fails halfway and leaves
# a partial deployment, which is worse than not starting.
if [ "$BALANCE" = "0" ]; then
  printf '\nThis address has no MON. Fund it at https://faucet.monad.xyz and run this again.\n'
  exit 1
fi

printf '\n==> Deploying to Monad testnet (%s)\n\n' "$RPC"
(
  cd contracts
  DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" \
    forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --slow
)

FILE="contracts/deployments/${CHAIN_ID}.json"
if [ ! -f "$FILE" ]; then
  printf '\nThe deploy finished but %s was not written. Nothing has been configured.\n' "$FILE"
  exit 1
fi

printf '\n==> Wrote %s\n' "$FILE"
printf '\n==> Paste these into Vercel (Project -> Settings -> Environment Variables)\n\n'

node -e '
const d = require("./contracts/deployments/10143.json");
const ZERO = "0x0000000000000000000000000000000000000000";
const map = {
  assetRegistry: "NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS",
  portfolioMandate: "NEXT_PUBLIC_PORTFOLIO_MANDATE_ADDRESS",
  portfolioVault: "NEXT_PUBLIC_PORTFOLIO_VAULT_ADDRESS",
  rebalanceExecutor: "NEXT_PUBLIC_REBALANCE_EXECUTOR_ADDRESS",
  riskSignalReceiver: "NEXT_PUBLIC_RISK_SIGNAL_RECEIVER_ADDRESS",
  priceOracle: "NEXT_PUBLIC_PRICE_ORACLE_ADDRESS",
  executionAdapter: "NEXT_PUBLIC_EXECUTION_ADAPTER_ADDRESS",
  kuruAdapter: "NEXT_PUBLIC_KURU_ADAPTER_ADDRESS",
  mUSD: "NEXT_PUBLIC_MUSD_ADDRESS",
  mBTC: "NEXT_PUBLIC_MBTC_ADDRESS",
  mETH: "NEXT_PUBLIC_METH_ADDRESS",
  mBOND: "NEXT_PUBLIC_MBOND_ADDRESS",
};
const all = { ...d.contracts, ...d.tokens };
console.log("NEXT_PUBLIC_MONAD_CHAIN_ID=10143");
for (const [key, envKey] of Object.entries(map)) {
  const v = all[key];
  if (v && v.toLowerCase() !== ZERO) console.log(`${envKey}=${v}`);
}
'

cat <<'MSG'

Also set, in the same place:

  MONAD_RPC_URL                       a testnet RPC endpoint (yours, not a shared public one)
  NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID  so people can sign in
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   so goals and history are kept

Leave MODALIS_DEV_AUTH unset. It is a local-only escape hatch and /api/status reports it loudly
wherever it is on.

Then redeploy. /api/status will report what is actually wired up; anything missing says so rather
than appearing to work.
MSG
