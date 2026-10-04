/**
 * Monad network configuration.
 *
 * Chain definitions come from viem's own registry rather than being hand-written here, so the
 * chain ids, native currency, block explorers and multicall3 deployments stay correct as Monad
 * evolves: Monad mainnet = 143, Monad testnet = 10143.
 */
import { monad, monadTestnet } from "viem/chains";
import type { Chain } from "viem";

export { monad, monadTestnet };

export type NetworkName = "mainnet" | "testnet";

export const MONAD_MAINNET_ID = monad.id; // 143
export const MONAD_TESTNET_ID = monadTestnet.id; // 10143

export const CHAINS: Record<NetworkName, Chain> = {
  mainnet: monad,
  testnet: monadTestnet,
};

export function chainFor(network: NetworkName): Chain {
  return CHAINS[network];
}

export function chainById(chainId: number): Chain {
  if (chainId === MONAD_MAINNET_ID) return monad;
  if (chainId === MONAD_TESTNET_ID) return monadTestnet;
  throw new Error(
    `Unsupported chain id ${chainId}. Modalis targets Monad mainnet (${MONAD_MAINNET_ID}) or testnet (${MONAD_TESTNET_ID}).`,
  );
}

export function networkForChainId(chainId: number): NetworkName {
  return chainById(chainId).id === MONAD_MAINNET_ID ? "mainnet" : "testnet";
}

/**
 * Alchemy is the default RPC/WebSocket provider. An explicit *_RPC_URL always wins, so a
 * self-hosted node or any other provider can be dropped in without code changes.
 */
export function alchemyHttpUrl(network: NetworkName, apiKey: string): string {
  const host = network === "mainnet" ? "monad-mainnet" : "monad-testnet";
  return `https://${host}.g.alchemy.com/v2/${apiKey}`;
}

export function alchemyWsUrl(network: NetworkName, apiKey: string): string {
  const host = network === "mainnet" ? "monad-mainnet" : "monad-testnet";
  return `wss://${host}.g.alchemy.com/v2/${apiKey}`;
}

/** Explorer link for a transaction. Used by the UI; never build these by hand elsewhere. */
export function txUrl(chain: Chain, hash: string, explorerBase?: string): string | null {
  const base = explorerBase?.replace(/\/$/, "") ?? chain.blockExplorers?.default.url?.replace(/\/$/, "");
  return base ? `${base}/tx/${hash}` : null;
}

export function addressUrl(chain: Chain, address: string, explorerBase?: string): string | null {
  const base = explorerBase?.replace(/\/$/, "") ?? chain.blockExplorers?.default.url?.replace(/\/$/, "");
  return base ? `${base}/address/${address}` : null;
}
