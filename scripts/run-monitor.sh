#!/usr/bin/env bash
#
# MODALIS — run the risk monitor against the live testnet deployment, so "Do it for me" acts.
#
#   bash scripts/run-monitor.sh          # watch continuously (every 60s); Ctrl+C to stop
#   bash scripts/run-monitor.sh --once   # one pass, then exit
#
# Uses .env.golive: MANAGER_PRIVATE_KEY signs adjustments (it can only ever call
# RebalanceExecutor.execute, never withdraw or change a plan), and the Supabase keys let it find
# everyone who chose "Do it for me". Contract addresses come from the saved testnet deployment.
# Pair it with `bash scripts/move-prices.sh` in another window so there is drift to correct.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"
[ -f .env.golive ] || { echo "No .env.golive (cp scripts/golive.env.example .env.golive)"; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env.golive
set +a

KEEP="contracts/deployments/10143.testnet.json"
[ -f "$KEEP" ] || { echo "No $KEEP. Run bash scripts/go-live.sh first."; exit 1; }
[ -n "${MANAGER_PRIVATE_KEY:-}" ] || {
  echo "MANAGER_PRIVATE_KEY is empty in .env.golive."
  echo "  cast wallet new      # put the private key in .env.golive as MANAGER_PRIVATE_KEY"
  echo "  SKIP_TESTS=1 bash scripts/go-live.sh   # so the site knows the manager address"
  exit 1
}
RPC="${MONAD_TESTNET_RPC_URL:-https://testnet-rpc.monad.xyz}"

# Same address variables go-live gives Vercel.
eval "$(node -e '
const d = require("./'"$KEEP"'");
const map = {
  assetRegistry: "NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS", portfolioMandate: "NEXT_PUBLIC_PORTFOLIO_MANDATE_ADDRESS",
  portfolioVault: "NEXT_PUBLIC_PORTFOLIO_VAULT_ADDRESS", rebalanceExecutor: "NEXT_PUBLIC_REBALANCE_EXECUTOR_ADDRESS",
  riskSignalReceiver: "NEXT_PUBLIC_RISK_SIGNAL_RECEIVER_ADDRESS", priceOracle: "NEXT_PUBLIC_PRICE_ORACLE_ADDRESS",
  executionAdapter: "NEXT_PUBLIC_EXECUTION_ADAPTER_ADDRESS", kuruAdapter: "NEXT_PUBLIC_KURU_ADAPTER_ADDRESS",
  mUSD: "NEXT_PUBLIC_MUSD_ADDRESS", mBTC: "NEXT_PUBLIC_MBTC_ADDRESS", mETH: "NEXT_PUBLIC_METH_ADDRESS", mBOND: "NEXT_PUBLIC_MBOND_ADDRESS",
};
const all = { ...d.contracts, ...d.tokens };
for (const [k, e] of Object.entries(map)) if (all[k] && !/^0x0{40}$/i.test(all[k])) console.log(`export ${e}=${all[k]}`);
')"
export NEXT_PUBLIC_MONAD_CHAIN_ID=10143 MODALIS_NETWORK=testnet MONAD_TESTNET_RPC_URL="$RPC"
export RISK_MONITOR_AUTO_EXECUTE=true

# The manager pays gas for each adjustment. Top it up from the deployer when it runs low.
MANAGER="$(cast wallet address --private-key "$MANAGER_PRIVATE_KEY")"
if awk -v b="$(cast balance "$MANAGER" --ether --rpc-url "$RPC" 2>/dev/null || echo 0)" 'BEGIN{exit !(b < 0.05)}'; then
  if [ -n "${DEPLOYER_PRIVATE_KEY:-}" ] && cast send "$MANAGER" --value 0.2ether --rpc-url "$RPC" \
       --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null 2>&1; then
    echo "Sent 0.2 MON to the manager $MANAGER for gas."
  else
    echo "The manager $MANAGER has almost no MON. Fund it at https://faucet.monad.xyz"
  fi
fi

if [ "${1:-}" = "--once" ]; then exec pnpm --silent risk-monitor:once; fi
exec pnpm --silent risk-monitor
