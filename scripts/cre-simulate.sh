#!/usr/bin/env bash
# Fills the Chainlink CRE workflow's config with this deployment's addresses, runs
# `cre workflow simulate`, and saves the output to integrations/chainlink-cre/SIMULATION.md.
#
#   bash scripts/cre-simulate.sh 0xYourPlanOwner [more owners...] [-- extra cre flags]
#
# Needs the CRE CLI (>= 1.29 for Monad) and `cre login`. If the CLI asks for a project.yaml,
# run `cre init` inside integrations/chainlink-cre once, then run this again.
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP="contracts/deployments/10143.testnet.json"
[ -f "$KEEP" ] || { echo "No $KEEP. Run bash scripts/go-live.sh first."; exit 1; }
command -v cre >/dev/null || {
  echo "CRE CLI is missing. Install it with: curl -sSL https://app.chain.link/install.sh | bash"
  echo "Then open a new WSL terminal (or run: source ~/.bashrc) and retry."
  exit 1
}

OWNERS=()
while [ $# -gt 0 ] && [ "$1" != "--" ]; do OWNERS+=("$1"); shift; done
[ "${1:-}" = "--" ] && shift
[ ${#OWNERS[@]} -gt 0 ] || { echo "Pass at least one plan owner's address to watch."; exit 1; }

CFG="integrations/chainlink-cre/config.testnet.json"
node - "$KEEP" "$CFG" "${OWNERS[@]}" <<'EOF'
const fs = require("fs");
const [keep, cfgPath, ...owners] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(keep, "utf8"));
const c = d.contracts || {};
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
for (const k of ["rebalanceExecutor", "portfolioMandate", "assetRegistry"]) {
  if (!c[k]) { console.error(`Missing ${k} in ${keep}`); process.exit(1); }
  cfg[k] = c[k];
}
// Without a receiver the simulation still reads, computes and signs; the write has nowhere to go.
cfg.riskSignalReceiver = c.riskSignalReceiver || "0x0000000000000000000000000000000000000000";
cfg.owners = owners;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
EOF

OUT="integrations/chainlink-cre/SIMULATION.md"
LOG="$(mktemp)"
( cd integrations/chainlink-cre && cre workflow simulate . "$@" ) 2>&1 | tee "$LOG"
{
  echo "# CRE workflow simulation"
  echo
  echo "- Date: $(date -u +"%Y-%m-%d %H:%M UTC")"
  echo "- Commit: $(git rev-parse --short HEAD)"
  echo "- CLI: $(cre version 2>/dev/null | head -1)"
  echo "- Watched: ${OWNERS[*]}"
  echo
  echo "Command: \`cre workflow simulate . $*\` in integrations/chainlink-cre"
  echo
  echo '```'
  cat "$LOG"
  echo '```'
} >"$OUT"
rm -f "$LOG"
echo
echo "Saved $OUT. Commit it with: git add $OUT $CFG && git commit -m 'CRE simulation' && git push"
