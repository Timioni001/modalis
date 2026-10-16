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
import {
  createWalletClient,
  http,
  getAddress,
  type Address,
  type WalletClient,
} from "viem";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { chainById } from "@modalis/chain";
import dynamic from "next/dynamic";
const DynamicProvider = dynamic(
  () => import("./dynamic-provider").then((module) => module.DynamicProvider),
  {
    ssr: false,
    loading: () => (
      <div role="status" className="p-6 text-center text-ink-soft">
        Opening your account…
      </div>
    ),
  },
);
import { WalletContext, type WalletState } from "@/components/wallet-context";

export type Deployment = {
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
  const pathname = usePathname() ?? "/";
  const walletFlow = ["/app", "/onboarding", "/plan"].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const localWallet =
    process.env.NODE_ENV !== "production"
      ? process.env.NEXT_PUBLIC_DEV_WALLET
      : undefined;
  if (
    localWallet &&
    /^0x[0-9a-fA-F]{40}$/.test(localWallet) &&
    deployment.rpcUrl &&
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(deployment.rpcUrl).hostname,
    )
  ) {
    return (
      <LocalWallet deployment={deployment} address={getAddress(localWallet)}>
        {children}
      </LocalWallet>
    );
  }
  if (!environmentId || !walletFlow) {
    return (
      <PreviewWallet
        deployment={deployment}
        configured={Boolean(environmentId)}
      >
        {children}
      </PreviewWallet>
    );
  }

  return (
    <DynamicProvider environmentId={environmentId} deployment={deployment}>
      {children}
    </DynamicProvider>
  );
}

function PreviewWallet({
  children,
  deployment,
  configured,
}: {
  children: ReactNode;
  deployment: Deployment;
  configured: boolean;
}) {
  const value = useMemo<WalletState>(
    () => ({
      ...deployment,
      configured,
      loggedIn: false,
      address: null,
      getWalletClient: async () => {
        throw new Error(
          configured
            ? "Open the testnet demo to sign in before signing."
            : "Wallet onboarding is not configured.",
        );
      },
    }),
    [deployment, configured],
  );
  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

/** Uses an unlocked Anvil account on loopback only. No private key enters the browser bundle. */
function LocalWallet({
  children,
  deployment,
  address,
}: {
  children: ReactNode;
  deployment: Deployment;
  address: Address;
}) {
  const value = useMemo<WalletState>(
    () => ({
      ...deployment,
      configured: true,
      loggedIn: true,
      address,
      localDevelopment: true,
      getWalletClient: async () =>
        createWalletClient({
          account: address,
          chain: chainById(deployment.chainId),
          transport: http(deployment.rpcUrl),
        }) as WalletClient,
    }),
    [deployment, address],
  );
  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
