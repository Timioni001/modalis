#!/usr/bin/env python3
"""
Validates config.yaml against Envio's own evm.schema.json.

Envio substitutes ${VAR} before parsing, so this does the same with representative values and
then validates the resulting structure. It catches a malformed config without needing Docker,
Postgres or a network, which is exactly the class of mistake that would otherwise only surface
at `envio codegen`.

  python3 scripts/validate-config.py [path/to/evm.schema.json]
"""
import json
import os
import re
import sys
import pathlib

HERE = pathlib.Path(__file__).resolve().parent.parent

SAMPLE = {
    "ENVIO_START_BLOCK": "251449",
    "MONAD_TESTNET_RPC_URL": "https://monad-testnet.g.alchemy.com/v2/demo",
    "NEXT_PUBLIC_PORTFOLIO_MANDATE_ADDRESS": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    "NEXT_PUBLIC_PORTFOLIO_VAULT_ADDRESS": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    "NEXT_PUBLIC_REBALANCE_EXECUTOR_ADDRESS": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    "NEXT_PUBLIC_RISK_SIGNAL_RECEIVER_ADDRESS": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
}


def substitute(text: str) -> str:
    def repl(m):
        key = m.group(1)
        val = os.environ.get(key) or SAMPLE.get(key)
        if val is None:
            raise SystemExit(f"config.yaml references ${{{key}}}, which has no value or sample")
        return val
    return re.sub(r"\$\{([A-Z0-9_]+)\}", repl, text)


def main() -> int:
    import yaml
    from jsonschema import Draft202012Validator

    # Defaults to the schema shipped inside the installed envio package, so the check validates
    # against the exact version the project depends on.
    default_schema = HERE / "node_modules" / "envio" / "evm.schema.json"
    schema_path = sys.argv[1] if len(sys.argv) > 1 else (str(default_schema) if default_schema.exists() else None)
    if not schema_path:
        raise SystemExit(
            "Could not find envio/evm.schema.json. Run `pnpm install`, or pass the path explicitly."
        )

    raw = (HERE / "config.yaml").read_text()
    cfg = yaml.safe_load(substitute(raw))

    # start_block is an integer in the schema; YAML reads the substituted value as a string.
    for chain in cfg.get("chains", []):
        if isinstance(chain.get("start_block"), str):
            chain["start_block"] = int(chain["start_block"])

    schema = json.loads(pathlib.Path(schema_path).read_text())
    errors = sorted(Draft202012Validator(schema).iter_errors(cfg), key=lambda e: list(e.path))
    if errors:
        for e in errors:
            loc = "/".join(str(p) for p in e.path) or "(root)"
            print(f"INVALID  {loc}: {e.message}")
        return 1

    # Every referenced ABI must exist and contain every event the config names.
    abis = {c["name"]: json.loads((HERE / c["abi_file_path"]).read_text()) for c in cfg["contracts"]}
    problems = []
    for c in cfg["contracts"]:
        names = {e["name"] for e in abis[c["name"]] if e.get("type") == "event"}
        for ev in c["events"]:
            if ev["event"] not in names:
                problems.append(f"{c['name']}.{ev['event']} is not an event in {c['abi_file_path']}")
    for chain in cfg["chains"]:
        for cc in chain.get("contracts", []):
            if cc["name"] not in abis:
                problems.append(f"chain {chain['id']} references unknown contract {cc['name']}")
    if problems:
        for p in problems:
            print(f"INVALID  {p}")
        return 1

    print(f"config.yaml is valid against evm.schema.json")
    print(f"  {len(cfg['contracts'])} contracts, {sum(len(c['events']) for c in cfg['contracts'])} events")
    for c in cfg["contracts"]:
        print(f"  {c['name']}: {', '.join(e['event'] for e in c['events'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
