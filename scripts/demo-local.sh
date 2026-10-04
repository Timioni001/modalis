#!/usr/bin/env bash
#
# MODALIS — run the complete financial loop against a local EVM chain.
#
#   bash scripts/demo-local.sh
#
# Starts anvil, deploys the protocol, and runs all eleven steps of the loop: goal -> mandate ->
# deposit -> breach -> proposal -> contract rejection of an invalid action -> execution ->
# settlement -> updated state.
#
# Every transaction is real and every hash comes from the node. The ONLY synthetic input is the
# demo oracle price move that creates the breach.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"

PORT="${ANVIL_PORT:-8545}"
RPC="http://127.0.0.1:${PORT}"
# Well-known anvil test key. It holds nothing on any real network.
DEPLOYER="${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

cleanup() {
  if [ -n "${ANVIL_PID:-}" ]; then kill "$ANVIL_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

printf '\n==> Starting anvil on %s (chain id 10143)\n' "$RPC"
anvil --port "$PORT" --chain-id 10143 --silent &
ANVIL_PID=$!

for _ in $(seq 1 20); do
  if curl -sS -m 2 -X POST -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

printf '\n==> Deploying Modalis\n'
(cd contracts && DEPLOYER_PRIVATE_KEY="$DEPLOYER" \
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast \
  | grep -E 'AssetRegistry|PortfolioMandate|PortfolioVault|RebalanceExecutor|wrote deployments')

printf '\n==> Running the loop\n'
MODALIS_RPC_URL="$RPC" DEPLOYER_PRIVATE_KEY="$DEPLOYER" \
  node --experimental-strip-types services/demo/src/run-loop.ts

printf '\nThe report above is also written to docs/e2e-run.md.\n'

# By default anvil stays up so you can point the web app at it and click through the same flow.
# Set KEEP_ANVIL=false for a non-interactive run (CI), which exits as soon as the loop finishes.
if [ "${KEEP_ANVIL:-true}" = "false" ]; then
  printf 'Stopping anvil (KEEP_ANVIL=false).\n'
  exit 0
fi

printf 'anvil is still running on %s; press Ctrl-C to stop it.\n' "$RPC"
printf 'Point the web app at it with:\n'
printf '  MODALIS_RPC_URL=%s DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true pnpm dev\n' "$RPC"
wait "$ANVIL_PID"
