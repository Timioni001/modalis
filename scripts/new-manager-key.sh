#!/usr/bin/env bash
# Makes a fresh testnet key for MANAGER_PRIVATE_KEY and FAUCET_PRIVATE_KEY and writes it straight
# into .env.golive, so the private key is never printed or pasted anywhere. Prints only the address,
# which needs testnet MON from https://faucet.monad.xyz.
#
#   bash scripts/new-manager-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."
command -v cast >/dev/null || { echo "Needs Foundry's cast."; exit 1; }
[ -f .env.golive ] || cp scripts/golive.env.example .env.golive

cast wallet new 2>&1 | node -e '
  const fs = require("fs");
  let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
    // Read the key and address by shape, so it works whatever layout this cast version prints.
    const key = (s.match(/0x[0-9a-fA-F]{64}\b/) || [])[0];
    const address = (s.match(/0x[0-9a-fA-F]{40}\b/) || [])[0];
    if (!key || !address) { console.error("Unexpected output from cast wallet new"); process.exit(1); }
    let env = fs.readFileSync(".env.golive", "utf8");
    for (const name of ["MANAGER_PRIVATE_KEY", "FAUCET_PRIVATE_KEY"]) {
      const re = new RegExp(`^${name}=.*$`, "m");
      env = re.test(env) ? env.replace(re, `${name}=${key}`) : `${env.replace(/\n?$/, "\n")}${name}=${key}\n`;
    }
    fs.writeFileSync(".env.golive", env);
    console.log(`Saved a new key to .env.golive (MANAGER_PRIVATE_KEY and FAUCET_PRIVATE_KEY).`);
    console.log(`Fund this address with testnet MON: ${address}`);
  });
'
