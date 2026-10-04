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
        className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-muted"
        title="Set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID to enable wallet onboarding"
      >
        Wallet onboarding not configured
      </span>
    );
  }

  return <DynamicWidget innerButtonComponent={<span>Continue with email</span>} />;
}
