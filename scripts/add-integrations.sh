#!/usr/bin/env bash
#
# MODALIS — add the Chainlink CRE receiver and/or the Kuru adapter to the EXISTING testnet
# deployment, without redeploying anything else (plans, balances and addresses stay as they are).
#
#   bash scripts/add-integrations.sh
#
# Reads from .env.golive:
#   CRE_FORWARDER_ADDRESS   Chainlink CRE forwarder on Monad testnet (from Chainlink's CRE docs)
#                           -> deploys RiskSignalReceiver pinned to it
#   KURU_ROUTER_ADDRESS     Kuru's router on Monad testnet (from Kuru's docs)
#   KURU_MARKET_ADDRESSES   optional, comma-separated Kuru markets the adapter may trade on
#                           -> deploys KuruAdapter, allows those markets, approves it as a venue
# Each part runs only if its variable is set and that contract isn't already in the deployment.
# Then rerun `SKIP_TESTS=1 bash scripts/go-live.sh` so the site learns the new addresses.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"
[ -f .env.golive ] || { echo "No .env.golive"; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env.golive
set +a
KEEP="contracts/deployments/10143.testnet.json"
[ -f "$KEEP" ] || { echo "No $KEEP. Run bash scripts/go-live.sh first."; exit 1; }
[ -n "${DEPLOYER_PRIVATE_KEY:-}" ] || { echo "DEPLOYER_PRIVATE_KEY is empty in .env.golive."; exit 1; }
RPC="${MONAD_TESTNET_RPC_URL:-https://testnet-rpc.monad.xyz}"
DEPLOYER="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
get() { node -p "require('./$KEEP').contracts['$1'] || ''"; }
put() { node -e "const f='./$KEEP',fs=require('fs'),d=JSON.parse(fs.readFileSync(f));d.contracts['$1']='$2';fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n')"; }
create() { # path:Name args... -> prints the deployed address
  (cd contracts && forge create "$1" --broadcast --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" \
     --constructor-args "${@:2}" 2>&1) | awk '/Deployed to:/ {print $3}'
}
(cd contracts && forge build >/dev/null)
DID=0

if [ -n "${CRE_FORWARDER_ADDRESS:-}" ] && [ -z "$(get riskSignalReceiver)" ]; then
  addr="$(create src/RiskSignalReceiver.sol:RiskSignalReceiver "$DEPLOYER" "$CRE_FORWARDER_ADDRESS")"
  [ -n "$addr" ] || { echo "RiskSignalReceiver deploy failed."; exit 1; }
  put riskSignalReceiver "$addr"; DID=1
  echo "RiskSignalReceiver  $addr  (forwarder $CRE_FORWARDER_ADDRESS)"
fi

if [ -n "${KURU_ROUTER_ADDRESS:-}" ] && [ -z "$(get kuruAdapter)" ]; then
  addr="$(create src/adapters/KuruAdapter.sol:KuruAdapter "$DEPLOYER" "$KURU_ROUTER_ADDRESS")"
  [ -n "$addr" ] || { echo "KuruAdapter deploy failed."; exit 1; }
  if [ -n "${KURU_MARKET_ADDRESSES:-}" ]; then
    cast send "$addr" 'setMarketsAllowed(address[],bool)' "[${KURU_MARKET_ADDRESSES}]" true \
      --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null
  fi
  cast send "$(get assetRegistry)" 'setAdapterApproved(address,bool)' "$addr" true \
    --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null
  put kuruAdapter "$addr"; DID=1
  echo "KuruAdapter         $addr  (router $KURU_ROUTER_ADDRESS, approved as a venue)"
fi

if [ "$DID" = "1" ]; then
  echo
  echo "Saved to $KEEP. Now: SKIP_TESTS=1 bash scripts/go-live.sh   (and bash scripts/verify-contracts.sh)"
else
  echo "Nothing to add: set CRE_FORWARDER_ADDRESS and/or KURU_ROUTER_ADDRESS in .env.golive."
fi
