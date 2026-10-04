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
import { WalletContext, type WalletState } from "@/components/wallet-context";

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
              rpcUrls: deployment.rpcUrl ? [deployment.rpcUrl] : [],
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
   */
  const getWalletClient = useCallback(async (): Promise<WalletClient> => {
    if (!primaryWallet) throw new Error("No wallet connected");
    if (!isEthereumWallet(primaryWallet)) {
      throw new Error("Modalis needs an Ethereum-compatible wallet for Monad");
    }
    const client = await Promise.resolve(primaryWallet.getWalletClient(String(deployment.chainId)));
    if (!client) {
      throw new Error("Could not get a wallet client. Check the wallet is on the right network.");
    }
    return client as WalletClient;
  }, [primaryWallet, deployment.chainId]);

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
