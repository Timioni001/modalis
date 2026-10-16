"use client";
import { DynamicContextProvider, useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors, isEthereumWallet } from "@dynamic-labs/ethereum";
import { getAddress, type Address, type WalletClient } from "viem";
import { useCallback, useLayoutEffect, useMemo, type ReactNode } from "react";
import { chainById } from "@modalis/chain";
import { selectApiWallet } from "@/lib/client-api";
import { WalletContext, type WalletState } from "@/components/wallet-context";
import type { Deployment } from "./providers";

/** The chain's own public endpoint, from viem's registry. Used only when none is configured. */
function fallbackRpcUrl(chainId: number): string {
  try {
    return chainById(chainId).rpcUrls.default.http[0];
  } catch {
    return "https://testnet-rpc.monad.xyz";
  }
}

export function DynamicProvider({ children, environmentId, deployment }: { children: ReactNode; environmentId: string; deployment: Deployment }) {
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

  useLayoutEffect(() => {
    selectApiWallet(address);
    return () => selectApiWallet(null);
  }, [address]);

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
