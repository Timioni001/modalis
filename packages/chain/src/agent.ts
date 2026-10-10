/**
 * The agent's signer: a Dynamic server wallet when one is configured, the manager key otherwise.
 * See ./agent-env.ts for what the agent may and may not do.
 *
 * Server only, and deliberately not exported from the package index: the Dynamic SDK is large and
 * Node-only, so it is loaded lazily and only by code that signs (the execute routes and the risk
 * monitor). Import it as "@modalis/chain/agent".
 */
import type { Address, WalletClient } from "viem";
import { agentConfigFromEnv, type AgentConfig, type AgentKind } from "./agent-env.ts";
import { chainById, networkForChainId } from "./chains.ts";
import { createManagerWalletClient, httpUrlsFor, type RpcConfig } from "./clients.ts";

export type AgentWallet = {
  wallet: WalletClient;
  address: Address;
  kind: AgentKind;
  /**
   * Whether several transactions may be sent at once. The key wallet hands out nonces locally;
   * the Dynamic wallet asks the node for each one, so its sends must go one after another.
   */
  parallelSafe: boolean;
};

const cache = new Map<string, Promise<AgentWallet>>();

async function dynamicWallet(rpc: RpcConfig, cfg: Extract<AgentConfig, { kind: "dynamic" }>): Promise<AgentWallet> {
  const { DynamicEvmWalletClient } = await import("@dynamic-labs-wallet/node-evm");
  const client = new DynamicEvmWalletClient({ environmentId: cfg.dynamic.environmentId });
  await client.authenticateApiToken(cfg.dynamic.apiToken);
  const chain = chainById(rpc.chainId);
  const wallet = await client.getWalletClient({
    // The shapes come straight from createWalletAccount; they round-trip through JSON unchanged.
    walletMetadata: cfg.dynamic.wallet.walletMetadata as never,
    externalServerKeyShares: cfg.dynamic.wallet.externalServerKeyShares as never,
    password: cfg.dynamic.password,
    chain,
    chainId: rpc.chainId,
    rpcUrl: httpUrlsFor(rpc, networkForChainId(rpc.chainId), chain)[0],
  });
  return { wallet: wallet as unknown as WalletClient, address: cfg.address, kind: "dynamic", parallelSafe: false };
}

/** The agent wallet, or null when no agent is configured. Built once per process. */
export async function getAgentWallet(
  rpc: RpcConfig,
  env: Record<string, string | undefined> = process.env,
): Promise<AgentWallet | null> {
  const cfg = agentConfigFromEnv(env);
  if (!cfg) return null;
  if (cfg.kind === "key") {
    return { wallet: createManagerWalletClient(rpc, cfg.privateKey), address: cfg.address, kind: "key", parallelSafe: true };
  }
  const id = `${rpc.chainId}:${cfg.address}`;
  let pending = cache.get(id);
  if (!pending) {
    pending = dynamicWallet(rpc, cfg);
    // A failed sign-in to Dynamic shouldn't stick for the life of the process.
    pending.catch(() => cache.delete(id));
    cache.set(id, pending);
  }
  return pending;
}
