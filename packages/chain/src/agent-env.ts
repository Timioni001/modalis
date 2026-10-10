/**
 * Which wallet acts as the Modalis agent (the mandate's "manager"), read from the environment.
 *
 * The agent is the account a person authorises with PortfolioMandate.setManager. On-chain it can
 * only call RebalanceExecutor.execute inside the person's limits: it can never withdraw, change a
 * limit, or act for anyone who hasn't authorised it, and setManager(0) revokes it.
 *
 * Two ways to hold it:
 *   - a Dynamic server wallet (preferred): DYNAMIC_API_TOKEN, the Dynamic environment id and
 *     DYNAMIC_AGENT_WALLET, which scripts/create-agent-wallet.ts prints. The key is split by
 *     Dynamic's MPC, so no single machine ever holds it whole.
 *   - a plain private key (MANAGER_PRIVATE_KEY), the fallback for local work.
 *
 * This file only parses; it never loads the Dynamic SDK, so it is safe to import anywhere on the
 * server. Signing lives in ./agent.ts.
 */
import { getAddress, type Address } from "viem";
import { accountFromPrivateKey } from "./clients.ts";

export type AgentKind = "dynamic" | "key";

export type DynamicAgentConfig = {
  environmentId: string;
  apiToken: string;
  password?: string;
  /** What Dynamic returned when the wallet was created: its metadata and our key shares. */
  wallet: { walletMetadata: { accountAddress: string } & Record<string, unknown>; externalServerKeyShares: unknown[] };
};

export type AgentConfig =
  | { kind: "dynamic"; address: Address; dynamic: DynamicAgentConfig }
  | { kind: "key"; address: Address; privateKey: string };

type Env = Record<string, string | undefined>;

/** Decodes DYNAMIC_AGENT_WALLET: base64 (or raw) JSON of { walletMetadata, externalServerKeyShares }. */
export function decodeAgentWallet(raw: string): DynamicAgentConfig["wallet"] {
  const text = raw.trim().startsWith("{") ? raw.trim() : Buffer.from(raw.trim(), "base64").toString("utf8");
  const parsed = JSON.parse(text) as DynamicAgentConfig["wallet"];
  if (!parsed?.walletMetadata?.accountAddress || !Array.isArray(parsed.externalServerKeyShares)) {
    throw new Error("DYNAMIC_AGENT_WALLET is not the output of scripts/create-agent-wallet.ts");
  }
  return parsed;
}

export function encodeAgentWallet(wallet: DynamicAgentConfig["wallet"]): string {
  return Buffer.from(JSON.stringify(wallet), "utf8").toString("base64");
}

/** The configured agent, or null when there is none. Throws on a malformed setting. */
export function agentConfigFromEnv(env: Env = process.env): AgentConfig | null {
  const apiToken = env.DYNAMIC_API_TOKEN?.trim();
  const environmentId = (env.DYNAMIC_ENVIRONMENT_ID || env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID)?.trim();
  const rawWallet = env.DYNAMIC_AGENT_WALLET?.trim();
  if (apiToken && environmentId && rawWallet) {
    const wallet = decodeAgentWallet(rawWallet);
    return {
      kind: "dynamic",
      address: getAddress(wallet.walletMetadata.accountAddress),
      dynamic: { apiToken, environmentId, wallet, password: env.DYNAMIC_AGENT_PASSWORD || undefined },
    };
  }
  const key = env.MANAGER_PRIVATE_KEY?.trim();
  if (key) return { kind: "key", address: getAddress(accountFromPrivateKey(key).address), privateKey: key };
  return null;
}

/** The agent's address and kind without signing anything; null when none or misconfigured. */
export function agentIdentity(env: Env = process.env): { address: Address; kind: AgentKind } | null {
  try {
    const cfg = agentConfigFromEnv(env);
    return cfg ? { address: cfg.address, kind: cfg.kind } : null;
  } catch {
    return null;
  }
}

/** How the agent is described to people. */
export function agentLabel(kind: AgentKind): string {
  return kind === "dynamic" ? "Dynamic server wallet" : "Modalis key";
}
