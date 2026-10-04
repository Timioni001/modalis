/**
 * Deployed contract addresses.
 *
 * Source of truth is the JSON the deploy script writes to `contracts/deployments/<chainId>.json`.
 * Environment variables override it, which is what the browser bundle uses (NEXT_PUBLIC_*).
 * Nothing is hard-coded: an address that was never deployed is absent, not invented.
 */
import { getAddress, isAddress, type Address } from "viem";

export type ContractKey =
  | "assetRegistry"
  | "portfolioMandate"
  | "portfolioVault"
  | "rebalanceExecutor"
  | "riskSignalReceiver"
  | "priceOracle"
  | "executionAdapter"
  | "kuruAdapter";

export type TokenKey = "mUSD" | "mBTC" | "mETH" | "mBOND";

export type Deployment = {
  chainId: number;
  blockNumber?: number;
  contracts: Partial<Record<ContractKey, Address>>;
  tokens: Partial<Record<TokenKey, Address>>;
};

const ENV_KEYS: Record<ContractKey, string> = {
  assetRegistry: "NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS",
  portfolioMandate: "NEXT_PUBLIC_PORTFOLIO_MANDATE_ADDRESS",
  portfolioVault: "NEXT_PUBLIC_PORTFOLIO_VAULT_ADDRESS",
  rebalanceExecutor: "NEXT_PUBLIC_REBALANCE_EXECUTOR_ADDRESS",
  riskSignalReceiver: "NEXT_PUBLIC_RISK_SIGNAL_RECEIVER_ADDRESS",
  priceOracle: "NEXT_PUBLIC_PRICE_ORACLE_ADDRESS",
  executionAdapter: "NEXT_PUBLIC_EXECUTION_ADAPTER_ADDRESS",
  kuruAdapter: "NEXT_PUBLIC_KURU_ADAPTER_ADDRESS",
};

const TOKEN_ENV_KEYS: Record<TokenKey, string> = {
  mUSD: "NEXT_PUBLIC_MUSD_ADDRESS",
  mBTC: "NEXT_PUBLIC_MBTC_ADDRESS",
  mETH: "NEXT_PUBLIC_METH_ADDRESS",
  mBOND: "NEXT_PUBLIC_MBOND_ADDRESS",
};

function readEnvAddress(env: Record<string, string | undefined>, key: string): Address | undefined {
  const raw = env[key]?.trim();
  if (!raw) return undefined;
  if (!isAddress(raw)) throw new Error(`${key} is not a valid address: ${raw}`);
  return getAddress(raw);
}

/**
 * Builds a Deployment from environment variables, optionally layered over a deployments file
 * (which the deploy script writes). Env wins so a single build can point at either network.
 */
export function deploymentFromEnv(
  chainId: number,
  env: Record<string, string | undefined> = process.env,
  base?: Partial<Deployment>,
): Deployment {
  const contracts: Partial<Record<ContractKey, Address>> = { ...(base?.contracts ?? {}) };
  for (const [key, envKey] of Object.entries(ENV_KEYS) as [ContractKey, string][]) {
    const v = readEnvAddress(env, envKey);
    if (v) contracts[key] = v;
  }
  const tokens: Partial<Record<TokenKey, Address>> = { ...(base?.tokens ?? {}) };
  for (const [key, envKey] of Object.entries(TOKEN_ENV_KEYS) as [TokenKey, string][]) {
    const v = readEnvAddress(env, envKey);
    if (v) tokens[key] = v;
  }
  return { chainId, blockNumber: base?.blockNumber, contracts, tokens };
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Loads `contracts/deployments/<chainId>.json` as written by the deploy script.
 *
 * The script emits the zero address for anything it deliberately skipped (no CRE forwarder, no
 * Kuru router). Those are treated as ABSENT here, so a missing integration surfaces as "not
 * deployed" rather than as a contract at 0x0.
 */
export function deploymentFromJson(raw: unknown): Deployment {
  const o = raw as {
    chainId?: number;
    blockNumber?: number;
    contracts?: Record<string, string>;
    tokens?: Record<string, string>;
  };
  if (typeof o?.chainId !== "number") throw new Error("Deployment JSON is missing a numeric chainId");

  const pick = <K extends string>(src: Record<string, string> | undefined): Partial<Record<K, Address>> => {
    const out: Record<string, Address> = {};
    for (const [k, v] of Object.entries(src ?? {})) {
      if (!v || v.toLowerCase() === ZERO) continue;
      if (!isAddress(v)) throw new Error(`Deployment JSON has an invalid address for ${k}: ${v}`);
      out[k] = getAddress(v);
    }
    return out as Partial<Record<K, Address>>;
  };

  return {
    chainId: o.chainId,
    blockNumber: o.blockNumber,
    contracts: pick<ContractKey>(o.contracts),
    tokens: pick<TokenKey>(o.tokens),
  };
}

/** Which of the optional, integration-gated contracts are actually deployed. */
export function deployedIntegrations(d: Deployment): { kuru: boolean; cre: boolean; demoAdapter: boolean } {
  return {
    kuru: Boolean(d.contracts.kuruAdapter),
    cre: Boolean(d.contracts.riskSignalReceiver),
    demoAdapter: Boolean(d.contracts.executionAdapter),
  };
}

/** Throws a clear, actionable error instead of returning a zero address. */
export function requireContract(d: Deployment, key: ContractKey): Address {
  const a = d.contracts[key];
  if (!a) {
    throw new Error(
      `${key} is not deployed on chain ${d.chainId}. Run the deploy script and set ${ENV_KEYS[key]}.`,
    );
  }
  return a;
}

export function requireToken(d: Deployment, key: TokenKey): Address {
  const a = d.tokens[key];
  if (!a) throw new Error(`Demo token ${key} is not deployed on chain ${d.chainId}. Set ${TOKEN_ENV_KEYS[key]}.`);
  return a;
}

export function isFullyDeployed(d: Deployment): boolean {
  return (["assetRegistry", "portfolioMandate", "portfolioVault", "rebalanceExecutor"] as ContractKey[]).every(
    (k) => Boolean(d.contracts[k]),
  );
}
