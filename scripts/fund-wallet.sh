#!/usr/bin/env bash
#
# MODALIS — give a wallet some demo tokens so it can actually add money.
#
#   bash scripts/fund-wallet.sh 0xYourWalletAddress
#
# The demo tokens (mUSD, mBTC, mETH, mBOND) are open-mint on purpose — they are testnet props,
# not assets, and anyone may mint them. Without them the "Add money" screen correctly reports a
# shortfall and refuses to go further, so a fresh wallet needs this once before it can test
# anything downstream.
#
# Reads the addresses from contracts/deployments/<chainId>.json, so it funds whatever network you
# last deployed to. Gas is paid by DEPLOYER_PRIVATE_KEY (or anvil's first account locally).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"

TO="${1:-}"
if [ -z "$TO" ]; then
  echo "Usage: bash scripts/fund-wallet.sh 0xYourWalletAddress"
  echo
  echo "The address is the one shown under Settings -> Your account in the app,"
  echo "i.e. the wallet you signed in with."
  exit 1
fi

CHAIN_ID="${CHAIN_ID:-10143}"
RPC="${MODALIS_RPC_URL:-${MONAD_TESTNET_RPC_URL:-https://testnet-rpc.monad.xyz}}"
FILE="contracts/deployments/${CHAIN_ID}.json"

if [ ! -f "$FILE" ]; then
  echo "No $FILE. Deploy first:"
  echo "  bash scripts/deploy-testnet.sh        # Monad testnet"
  echo "  bash scripts/demo-local.sh            # local anvil"
  exit 1
fi

# Anvil's well-known first account. It holds nothing on any real network, so it is only ever a
# fallback for a local run; a testnet run must supply its own funded key.
KEY="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

# Amounts are generous but finite, and each is written in that token's own decimals: mUSD has 6,
# mBTC has 8, the rest have 18. Minting 1e18 "dollars" of a 6-decimal token would hand someone a
# trillion-dollar balance and make every figure on screen nonsense.
mint() {
  local symbol="$1" units="$2"
  local addr
  addr="$(node -p "require('./${FILE}').tokens['${symbol}'] || ''")"
  if [ -z "$addr" ] || [ "$addr" = "0x0000000000000000000000000000000000000000" ]; then
    printf '    %-6s skipped (not deployed on this network)\n' "$symbol"
    return
  fi
  cast send "$addr" "mint(address,uint256)" "$TO" "$units" \
    --rpc-url "$RPC" --private-key "$KEY" >/dev/null
  printf '    %-6s ok\n' "$symbol"
}

printf '\n==> Minting demo tokens to %s on chain %s\n\n' "$TO" "$CHAIN_ID"
mint mUSD  10000000000        # 10,000 at 6 decimals
mint mBTC  20000000           # 0.2 at 8 decimals
mint mETH  4000000000000000000    # 4 at 18 decimals
mint mBOND 100000000000000000000  # 100 at 18 decimals

cat <<'MSG'

Done. That is roughly $35,000 of demo value at the oracle's opening prices.

These are props on a test network. They are not assets, they are worth nothing, and the
"Add money" screen says so.

Next: open the app, approve a plan, and add money.
MSG
