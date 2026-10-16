#!/usr/bin/env bash
#
# MODALIS — one-time setup for Ubuntu / WSL2.
#
# Installs the toolchain Modalis needs and fetches contract dependencies. Safe to re-run: every
# step checks before installing.
#
#   bash scripts/setup.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
ok()   { printf '    \033[0;32mok\033[0m %s\n' "$1"; }
warn() { printf '    \033[0;33m!\033[0m  %s\n' "$1"; }

# ------------------------------------------------------------------ Node 22+
info "Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. On Ubuntu/WSL:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node 22 or newer is required (found $(node -v))."
  echo "Modalis runs TypeScript directly with Node's type stripping, which needs 22+."
  exit 1
fi
ok "$(node -v)"

# -------------------------------------------------------------------- pnpm
info "pnpm"
if ! command -v pnpm >/dev/null 2>&1; then
  warn "installing pnpm via corepack"
  corepack enable
  corepack prepare pnpm@10.28.0 --activate
fi
ok "pnpm $(pnpm -v)"

# ------------------------------------------------------------------ Foundry
info "Foundry"
if ! command -v forge >/dev/null 2>&1; then
  warn "installing Foundry"
  curl -L https://foundry.paradigm.xyz | bash
  # foundryup lands in ~/.foundry/bin; make it available to this shell too.
  export PATH="$HOME/.foundry/bin:$PATH"
  foundryup
  warn "add this to your ~/.bashrc if it is not already there:"
  warn '  export PATH="$HOME/.foundry/bin:$PATH"'
fi
ok "$(forge --version | head -1)"

# ------------------------------------------------------- contract dependencies
info "Contract dependencies"
if [ ! -d contracts/lib/forge-std ]; then
  git clone --quiet --depth 1 --branch v1.11.0 \
    https://github.com/foundry-rs/forge-std.git contracts/lib/forge-std
  ok "forge-std v1.11.0"
else
  ok "forge-std already present"
fi
if [ ! -d contracts/lib/openzeppelin-contracts ]; then
  git clone --quiet --depth 1 --branch v5.4.0 \
    https://github.com/OpenZeppelin/openzeppelin-contracts.git contracts/lib/openzeppelin-contracts
  ok "openzeppelin-contracts v5.4.0"
else
  ok "openzeppelin-contracts already present"
fi

# ------------------------------------------------------------ JS dependencies
info "Workspace dependencies"
pnpm install --frozen-lockfile
ok "installed"

# ----------------------------------------------------------------- contracts
info "Building contracts"
(cd contracts && forge build >/dev/null)
ok "built"

info "Generating ABIs for the app and the indexer"
pnpm --filter @modalis/chain sync-abis
ok "done"

# ----------------------------------------------------------------------- env
info "Environment"
if [ ! -f .env ]; then
  cp .env.example .env
  warn "created .env from .env.example — fill it in before deploying to Monad"
else
  ok ".env already exists"
fi

cat <<'EOF'

Setup complete.

  Run everything that can be verified offline:
    bash scripts/verify.sh

  Run the full financial loop against a local chain:
    bash scripts/demo-local.sh

  Start the web app:
    pnpm dev

EOF
