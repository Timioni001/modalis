"use client";

/**
 * Wallet entry point.
 *
 * Leads with "Continue with email" rather than "Connect wallet", because a first-time user should
 * not need to know what a wallet is. External wallets stay supported through the same widget.
 */
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { useWalletConfig } from "./wallet-context";

export function WalletButton() {
  const { configured } = useWalletConfig();

  if (!configured) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-current opacity-55"
        title="Set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID to enable sign-in"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
        Sign-in not set up
      </span>
    );
  }

  return <DynamicWidget innerButtonComponent={<span>Continue with email</span>} />;
}
