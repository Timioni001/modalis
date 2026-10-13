#!/usr/bin/env bash
# In a second terminal, after scripts/demo-local.sh has started Anvil.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export MODALIS_LOCAL_DEVELOPMENT=true
export MODALIS_RPC_URL=http://127.0.0.1:8545
export NEXT_PUBLIC_MONAD_RPC_URL="$MODALIS_RPC_URL"
export NEXT_PUBLIC_MONAD_CHAIN_ID=10143
export MODALIS_DEV_AUTH=true NEXT_PUBLIC_DEV_WALLET=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true
# Public, well-known Anvil test keys, used exclusively against loopback.
export MANAGER_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
export ORACLE_UPDATER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export FAUCET_PRIVATE_KEY="$ORACLE_UPDATER_PRIVATE_KEY"
# Webpack keeps the local demo's cold compilation within typical WSL memory budgets.
if [[ " $* " != *" --webpack "* && " $* " != *" --turbopack "* && " $* " != *" --turbo "* ]]; then
  set -- --webpack "$@"
fi
exec node scripts/web.mjs dev "$@"
