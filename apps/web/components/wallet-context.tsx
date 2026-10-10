"use client";

/**
 * Wallet state, published through one context.
 *
 * Why a context rather than calling Dynamic's hooks wherever they are needed: those hooks require
 * DynamicContextProvider to be mounted and throw "Store not initialized" without it. Since the
 * provider is only mounted when NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is set, calling them directly
 * from a page would crash whenever wallet onboarding is unconfigured — including during a
 * production prerender, which is exactly how this was caught.
 *
 * So the Dynamic hooks live in exactly one component, mounted only when the provider is
 * (see providers.tsx), and everything else reads this context. Hook order stays consistent in
 * every component, and an unconfigured deployment renders a clear message instead of throwing.
 */
import { createContext, useContext } from "react";
import type { Address, WalletClient } from "viem";

export type WalletState = {
  /** False when NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is absent. */
  configured: boolean;
  chainId: number;
  networkName: string;
  explorerUrl?: string;
  /** NEXT_PUBLIC_MONAD_RPC_URL when set; otherwise the chain's public endpoint is used. */
  rpcUrl?: string;
  demoMode: boolean;
  loggedIn: boolean;
  address: Address | null;
  getWalletClient: () => Promise<WalletClient>;
};

export const WalletContext = createContext<WalletState>({
  configured: false,
  chainId: 10143,
  networkName: "Monad Testnet",
  demoMode: false,
  loggedIn: false,
  address: null,
  getWalletClient: async () => {
    throw new Error(
      "Wallet onboarding is not configured. Set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID.",
    );
  },
});

/** Full wallet state, including the signer. */
export function useWallet(): WalletState {
  return useContext(WalletContext);
}

/** Just the deployment-level bits, for components that never sign. */
export function useWalletConfig(): Pick<
  WalletState,
  "configured" | "chainId" | "networkName" | "explorerUrl" | "rpcUrl" | "demoMode"
> {
  const { configured, chainId, networkName, explorerUrl, rpcUrl, demoMode } = useContext(WalletContext);
  return { configured, chainId, networkName, explorerUrl, rpcUrl, demoMode };
}
