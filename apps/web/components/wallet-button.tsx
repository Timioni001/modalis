"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useWallet } from "./wallet-context";
const ConfiguredWalletButton = dynamic(
  () =>
    import("./dynamic-wallet-button").then(
      (module) => module.ConfiguredWalletButton,
    ),
  {
    ssr: false,
    loading: () => (
      <span role="status" className="text-xs text-ink-muted">
        Opening sign-in…
      </span>
    ),
  },
);

/** Preview is always available; actual signing stays a separate, explicit testnet action. */
export function WalletButton({
  compact = false,
  signIn = false,
}: {
  compact?: boolean;
  signIn?: boolean;
}) {
  const { configured, localDevelopment, loggedIn } = useWallet();
  const cls =
    "inline-flex min-h-11 max-w-full shrink-0 items-center justify-center rounded-full bg-panel px-4 text-sm font-semibold text-panel-ink";
  if (!signIn)
    return (
      <Link href="/demo" className={cls}>
        Try the demo
      </Link>
    );
  if (localDevelopment)
    return (
      <Link
        href="/app/settings"
        className={cls}
        title="Unlocked local Anvil account; development only"
      >
        Local account
      </Link>
    );
  if (!configured)
    return (
      <Link href="/demo" className={cls}>
        Try the demo
      </Link>
    );
  return <ConfiguredWalletButton compact={compact || loggedIn} />;
}
