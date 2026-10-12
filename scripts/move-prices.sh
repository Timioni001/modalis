#!/usr/bin/env bash
#
# MODALIS — keep the demo market moving on Monad testnet, using the keys in .env.golive.
#
#   bash scripts/move-prices.sh            # nudge prices every 30s until Ctrl+C
#   bash scripts/move-prices.sh --once     # one nudge (also refreshes stale prices)
#   bash scripts/move-prices.sh --reset    # back to the opening prices
#
# Leave it running in a WSL window while you record the demo: plans drift off target on their
# own, and "Do it for me" has something to fix. See services/demo/src/move-prices.ts.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[ -f .env.golive ] || { echo "No .env.golive (cp scripts/golive.env.example .env.golive)"; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env.golive
set +a
[ -f contracts/deployments/10143.testnet.json ] && export CHAIN_ID=10143
exec pnpm --silent prices "$@"
