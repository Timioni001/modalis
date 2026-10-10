/**
 * Server-only chain access.
 *
 * This module must never be imported from a client component: it can construct the MANAGER wallet,
 * whose single power is calling RebalanceExecutor.execute. That key stays on the server.
 *
 * Authority recap, because this file is where it would be easiest to get wrong:
 *   - the USER's wallet (Dynamic) signs mandate changes, deposits and withdrawals, in the browser
 *   - the MANAGER key signs only rebalance proposals, here
 *   - neither can bypass PortfolioMandate, which is enforced on-chain
 */
import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createManagerWalletClient,
  createMonadPublicClient,
  deploymentFromEnv,
  deploymentFromJson,
  hasMulticall3,
  isFullyDeployed,
  rpcConfigFromEnv,
  type Deployment,
  type RpcConfig,
} from "@modalis/chain";
import { getAgentWallet } from "@modalis/chain/agent";
import type { PublicClient, WalletClient } from "viem";

export type ServerContext = {
  rpc: RpcConfig;
  deployment: Deployment;
  client: PublicClient;
  deployed: boolean;
};

let cached: ServerContext | null = null;

/**
 * Reads the deploy script's output. Environment variables take precedence, so a single build can
 * be pointed at a different deployment without a rebuild; the file is the convenient default for
 * local work.
 */
function loadDeployment(chainId: number): Deployment {
  const fromEnv = deploymentFromEnv(chainId);
  if (isFullyDeployed(fromEnv)) return fromEnv;

  try {
    const path = resolve(process.cwd(), "../../contracts/deployments", `${chainId}.json`);
    const fromFile = deploymentFromJson(JSON.parse(readFileSync(path, "utf8")));
    // Env still wins for anything it specifies.
    return {
      chainId,
      blockNumber: fromEnv.blockNumber ?? fromFile.blockNumber,
      contracts: { ...fromFile.contracts, ...fromEnv.contracts },
      tokens: { ...fromFile.tokens, ...fromEnv.tokens },
    };
  } catch {
    return fromEnv;
  }
}

export async function getServerContext(): Promise<ServerContext> {
  if (cached) return cached;

  const rpcEnv = rpcConfigFromEnv();
  const rpc: RpcConfig = {
    ...rpcEnv,
    httpUrl: process.env.MODALIS_RPC_URL ?? rpcEnv.httpUrl,
  };

  // Monad has Multicall3 on both networks; a local node may not, and batching against a missing
  // Multicall3 returns empty data rather than an error. Probe once.
  const probe = createMonadPublicClient({ ...rpc, multicall: false });
  const multicall = await hasMulticall3(probe).catch(() => false);
  const client = multicall ? createMonadPublicClient({ ...rpc, multicall: true }) : probe;

  const deployment = loadDeployment(rpc.chainId);
  cached = { rpc, deployment, client, deployed: isFullyDeployed(deployment) };
  return cached;
}

/**
 * The agent's wallet (the mandate's manager), or null when none is configured: a Dynamic server
 * wallet when DYNAMIC_AGENT_WALLET is set, the MANAGER_PRIVATE_KEY otherwise. The risk monitor
 * builds the same one, so both sign as the single manager each mandate allows.
 */
export async function getManagerWallet(rpc: RpcConfig): Promise<WalletClient | null> {
  return (await getAgentWallet(rpc))?.wallet ?? null;
}

/** The demo oracle updater, used only by the scenario engine. Never present on mainnet. */
export function getOracleWallet(rpc: RpcConfig): WalletClient | null {
  const key = process.env.ORACLE_UPDATER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) return null;
  if (rpc.chainId === 143) return null; // the scenario engine is never available on mainnet
  return createManagerWalletClient(rpc, key);
}

export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE ?? "false").toLowerCase() === "true";
}

export function aiConfig(): { apiKey?: string; model?: string; baseUrl?: string } {
  return { apiKey: process.env.AI_API_KEY, model: process.env.AI_MODEL, baseUrl: process.env.AI_BASE_URL || undefined };
}
