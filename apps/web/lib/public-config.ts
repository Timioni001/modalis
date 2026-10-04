/**
 * Configuration safe to ship to the browser.
 *
 * Everything here is either public by nature (addresses, chain ids, explorer URLs) or a publishable
 * key. No secret is referenced: NEXT_PUBLIC_ variables are compiled into the bundle, so a server
 * key placed here would be published to every visitor.
 */
export type PublicConfig = {
  chainId: number;
  networkName: string;
  explorerUrl?: string;
  dynamicEnvironmentId?: string;
  rpcUrl?: string;
  demoMode: boolean;
};

export function publicConfig(): PublicConfig {
  return {
    chainId: Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? 10143),
    networkName: process.env.NEXT_PUBLIC_MONAD_NETWORK_NAME ?? "Monad Testnet",
    explorerUrl: process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL || undefined,
    dynamicEnvironmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || undefined,
    rpcUrl: process.env.NEXT_PUBLIC_MONAD_RPC_URL || undefined,
    demoMode: (process.env.NEXT_PUBLIC_DEMO_MODE ?? "false").toLowerCase() === "true",
  };
}
