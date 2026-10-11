"use client";

/**
 * Dynamic powers the consumer wallet experience: email / social login, an embedded Monad wallet,
 * and signing. The user should not need to install a browser extension before seeing the product.
 *
 * Dynamic handles wallet UX. It does NOT handle financial permissions — those live in
 * PortfolioMandate on-chain. Being signed in grants no authority over anyone's portfolio; the
 * contracts key every action off msg.sender.
 *
 * The Dynamic hooks are called in exactly one place (DynamicWalletBridge), mounted only when the
 * provider is. Without an environment id the app still renders and says wallet onboarding is
 * unconfigured, rather than crashing on a hook that needs a provider that is not there.
 */
import { DynamicContextProvider, useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors, isEthereumWallet } from "@dynamic-labs/ethereum";
import { getAddress, type Address, type WalletClient } from "viem";
import { useCallback, useMemo, type ReactNode } from "react";
import { chainById } from "@modalis/chain";
import { WalletContext, type WalletState } from "@/components/wallet-context";

/** The chain's own public endpoint, from viem's registry. Used only when none is configured. */
function fallbackRpcUrl(chainId: number): string {
  try {
    return chainById(chainId).rpcUrls.default.http[0];
  } catch {
    return "https://testnet-rpc.monad.xyz";
  }
}

type Deployment = {
  chainId: number;
  networkName: string;
  rpcUrl?: string;
  explorerUrl?: string;
  demoMode: boolean;
};

export function Providers({
  children,
  environmentId,
  ...deployment
}: Deployment & { children: ReactNode; environmentId?: string }) {
  if (!environmentId) {
    return <UnconfiguredWallet deployment={deployment}>{children}</UnconfiguredWallet>;
  }

  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        walletConnectors: [EthereumWalletConnectors],
        // Modalis is a single-chain product; pinning the network stops a user signing a portfolio
        // action on the wrong chain.
        overrides: {
          evmNetworks: [
            {
              chainId: deployment.chainId,
              networkId: deployment.chainId,
              chainName: deployment.networkName,
              name: deployment.networkName,
              nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
              // Never an empty list: the connector builds its transport from this, and with
              // nothing in it every signature fails with "No URL was provided to the Transport".
              // `publicConfig` already falls back to the chain's own endpoint; this is the
              // backstop for any caller that doesn't.
              rpcUrls: [deployment.rpcUrl ?? fallbackRpcUrl(deployment.chainId)],
              blockExplorerUrls: deployment.explorerUrl ? [deployment.explorerUrl] : [],
              iconUrls: [],
            },
          ],
        },
      }}
    >
      <DynamicWalletBridge deployment={deployment}>{children}</DynamicWalletBridge>
    </DynamicContextProvider>
  );
}

/** The only component that touches Dynamic's hooks. */
function DynamicWalletBridge({
  children,
  deployment,
}: {
  children: ReactNode;
  deployment: Deployment;
}) {
  const { primaryWallet } = useDynamicContext();
  const loggedIn = useIsLoggedIn();

  const address: Address | null =
    primaryWallet?.address && /^0x[0-9a-fA-F]{40}$/.test(primaryWallet.address)
      ? getAddress(primaryWallet.address)
      : null;

  /**
   * Bridges Dynamic's wallet to a viem WalletClient. `getWalletClient` is synchronous on some
   * connectors and asynchronous on others, so it is awaited through Promise.resolve rather than
   * assuming either shape.
   *
   * The network is then CHECKED rather than assumed. Pinning it in the provider config asks the
   * wallet to be on the right chain; it does not guarantee the client that comes back is. An
   * external wallet can hand back a client still pointed somewhere else, and a transaction signed
   * there is signed against contracts that do not exist at those addresses — the worst kind of
   * failure, because it looks like it worked.
   */
  const getWalletClient = useCallback(async (): Promise<WalletClient> => {
    if (!primaryWallet) throw new Error("No wallet connected");
    if (!isEthereumWallet(primaryWallet)) {
      throw new Error("Modalis needs an Ethereum-compatible wallet.");
    }
    const client = (await Promise.resolve(
      primaryWallet.getWalletClient(String(deployment.chainId)),
    )) as WalletClient | undefined;
    if (!client) {
      throw new Error(
        `Your wallet isn't on ${deployment.networkName}. Switch networks in your wallet and try again.`,
      );
    }

    const actual = client.chain?.id ?? (await client.getChainId().catch(() => undefined));
    if (actual !== undefined && actual !== deployment.chainId) {
      throw new Error(
        `Your wallet is on a different network than Modalis. Switch it to ${deployment.networkName} and try again.`,
      );
    }
    return client;
  }, [primaryWallet, deployment.chainId, deployment.networkName]);

  const value = useMemo<WalletState>(
    () => ({ ...deployment, configured: true, loggedIn: Boolean(loggedIn), address, getWalletClient }),
    [deployment, loggedIn, address, getWalletClient],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function UnconfiguredWallet({ children, deployment }: { children: ReactNode; deployment: Deployment }) {
  const value = useMemo<WalletState>(
    () => ({
      ...deployment,
      configured: false,
      loggedIn: false,
      address: null,
      getWalletClient: async () => {
        throw new Error("Wallet onboarding is not configured. Set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID.");
      },
    }),
    [deployment],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
