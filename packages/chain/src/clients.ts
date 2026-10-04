/**
 * viem clients for Monad.
 *
 * Read path  : Alchemy HTTP (batched via multicall3) + optional WebSocket for live event streams.
 * Write paths: exactly two, and they are deliberately different kinds of authority.
 *   - the USER's wallet (Dynamic embedded or external) signs mandate changes, deposits, withdrawals
 *   - the MANAGER key signs ONLY RebalanceExecutor.execute
 * The manager key cannot withdraw or change a mandate; that is enforced on-chain, not here.
 */
import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  webSocket,
  type Account,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { alchemyHttpUrl, alchemyWsUrl, chainById, networkForChainId, type NetworkName } from "./chains.ts";

export type RpcConfig = {
  chainId: number;
  /** Explicit RPC URL. Wins over alchemyApiKey. */
  httpUrl?: string;
  /** Explicit WebSocket URL. Wins over alchemyApiKey. */
  wsUrl?: string;
  alchemyApiKey?: string;
  /**
   * Batch reads through Multicall3. Defaults to true, which is correct for Monad (both networks
   * have Multicall3 deployed). Set false against a bare local node that has no Multicall3, where
   * batched calls would otherwise return empty data. `hasMulticall3` probes for it.
   */
  multicall?: boolean;
};

function httpUrlsFor(cfg: RpcConfig, network: NetworkName, chain: Chain): string[] {
  const urls: string[] = [];
  if (cfg.httpUrl) urls.push(cfg.httpUrl);
  if (cfg.alchemyApiKey) urls.push(alchemyHttpUrl(network, cfg.alchemyApiKey));
  // Public endpoints last: a usable default, never a silent replacement for a configured provider.
  urls.push(...(chain.rpcUrls.default.http ?? []));
  return [...new Set(urls)];
}

function wsUrlFor(cfg: RpcConfig, network: NetworkName): string | undefined {
  if (cfg.wsUrl) return cfg.wsUrl;
  if (cfg.alchemyApiKey) return alchemyWsUrl(network, cfg.alchemyApiKey);
  return undefined;
}

/**
 * Read client. `fallback` keeps the dashboard alive if one endpoint degrades, and batching
 * collapses the per-asset reads a portfolio view needs into a single multicall3 request.
 */
export function createMonadPublicClient(cfg: RpcConfig): PublicClient {
  const chain = chainById(cfg.chainId);
  const network = networkForChainId(cfg.chainId);
  const urls = httpUrlsFor(cfg, network, chain);
  const batchReads = cfg.multicall ?? true;
  return createPublicClient({
    chain,
    transport: urls.length > 1 ? fallback(urls.map((u) => http(u))) : http(urls[0]),
    ...(batchReads ? { batch: { multicall: { wait: 16 } } as const } : {}),
  }) as PublicClient;
}

/** Event-stream client. Returns null when no WebSocket endpoint is configured. */
export function createMonadWebSocketClient(cfg: RpcConfig): PublicClient | null {
  const network = networkForChainId(cfg.chainId);
  const url = wsUrlFor(cfg, network);
  if (!url) return null;
  return createPublicClient({ chain: chainById(cfg.chainId), transport: webSocket(url) }) as PublicClient;
}

export function accountFromPrivateKey(pk: string): Account {
  const hex = pk.startsWith("0x") ? pk : `0x${pk}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Private key must be 32 bytes of hex. Use a fresh testnet-only key.");
  }
  return privateKeyToAccount(hex as `0x${string}`);
}

/**
 * Wallet client for the MANAGER key. The only call the backend ever makes with it is
 * RebalanceExecutor.execute; see services/risk-monitor. Keep it server-side.
 */
export function createManagerWalletClient(cfg: RpcConfig, privateKey: string): WalletClient {
  const chain = chainById(cfg.chainId);
  const network = networkForChainId(cfg.chainId);
  const urls = httpUrlsFor(cfg, network, chain);
  return createWalletClient({
    account: accountFromPrivateKey(privateKey),
    chain,
    transport: urls.length > 1 ? fallback(urls.map((u) => http(u))) : http(urls[0]),
  });
}

/** Reads RPC settings from the environment, with the documented variable names. */
export function rpcConfigFromEnv(env: Record<string, string | undefined> = process.env): RpcConfig {
  const network = (env.MODALIS_NETWORK ?? "testnet") as NetworkName;
  const chainId = Number(
    env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? (network === "mainnet" ? 143 : 10143),
  );
  return {
    chainId,
    httpUrl:
      env.NEXT_PUBLIC_MONAD_RPC_URL ||
      (network === "mainnet" ? env.MONAD_MAINNET_RPC_URL : env.MONAD_TESTNET_RPC_URL) ||
      undefined,
    wsUrl: (network === "mainnet" ? env.MONAD_MAINNET_WS_URL : env.MONAD_TESTNET_WS_URL) || undefined,
    alchemyApiKey: env.NEXT_PUBLIC_ALCHEMY_API_KEY || undefined,
  };
}

/**
 * Checks whether the chain actually has Multicall3 deployed at the address its chain definition
 * claims. Monad mainnet and testnet both do; a freshly started local node does not, and batching
 * against a missing Multicall3 silently returns empty data instead of erroring usefully.
 */
export async function hasMulticall3(client: PublicClient): Promise<boolean> {
  const address = client.chain?.contracts?.multicall3?.address;
  if (!address) return false;
  try {
    const code = await client.getCode({ address });
    return Boolean(code && code !== "0x");
  } catch {
    return false;
  }
}
