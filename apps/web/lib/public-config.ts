/**
 * Configuration safe to ship to the browser.
 *
 * Everything here is either public by nature (addresses, chain ids, explorer URLs) or a publishable
 * key. No secret is referenced: NEXT_PUBLIC_ variables are compiled into the bundle, so a server
 * key placed here would be published to every visitor.
 */
import { chainById } from "@modalis/chain";

export type PublicConfig = {
  chainId: number;
  networkName: string;
  explorerUrl?: string;
  dynamicEnvironmentId?: string;
  rpcUrl?: string;
  demoMode: boolean;
};

export function publicConfig(): PublicConfig {
  const chainId = Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID?.trim() || (process.env.MODALIS_NETWORK === "mainnet" ? 143 : 10143));
  // viem already carries Monad's explorer, so requiring the variable only to get a correct URL we
  // already hold would turn every receipt into plain text for no reason. The variable still wins,
  // for a deployment pointed at a private or alternative explorer.
  const chain = (() => {
    try {
      return chainById(chainId);
    } catch {
      return undefined;
    }
  })();

  return {
    chainId,
    networkName:
      process.env.NEXT_PUBLIC_MONAD_NETWORK_NAME ?? chain?.name ?? "Monad Testnet",
    explorerUrl:
      process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL ||
      chain?.blockExplorers?.default.url ||
      undefined,
    dynamicEnvironmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || undefined,
    // Same reasoning as the explorer: fall back to the chain's own endpoint rather than leaving
    // this empty. It is not cosmetic — the wallet connector is handed this list verbatim, and an
    // empty one leaves it with no endpoint to send a signed transaction to, which surfaced as
    // "No URL was provided to the Transport" on every action.
    rpcUrl:
      process.env.NEXT_PUBLIC_MONAD_RPC_URL?.trim() ||
      chain?.rpcUrls.default.http[0] ||
      undefined,
    demoMode: (process.env.NEXT_PUBLIC_DEMO_MODE ?? "false").toLowerCase() === "true",
  };
}
