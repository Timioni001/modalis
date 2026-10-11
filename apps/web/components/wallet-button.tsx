"use client";

/**
 * Wallet entry point.
 *
 * Leads with "Continue with email" rather than "Connect wallet", because a first-time user should
 * not need to know what a wallet is. External wallets stay supported through the same widget.
 *
 * Two sizes, because Dynamic's own widget is as wide as whatever it has to say — a network chip
 * plus an email address or an address. On a 390px phone that pushed the top bar off the screen
 * and cut the account control in half. `compact` renders our own fixed-width button instead and
 * opens Dynamic's account panel on tap, so nothing is lost but the width.
 */
import { DynamicWidget, useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { useWalletConfig } from "./wallet-context";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { configured } = useWalletConfig();

  if (!configured) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-current opacity-55"
        title="Set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID to enable sign-in"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
        {compact ? "No sign-in" : "Sign-in not set up"}
      </span>
    );
  }

  if (compact) return <CompactAccount />;

  // `min-w-0` lets the widget shrink inside a flex row rather than forcing the row wider.
  return (
    <span className="flex min-w-0 max-w-full">
      <DynamicWidget innerButtonComponent={<span>Continue with email</span>} />
    </span>
  );
}

/** Signed in: a round button that opens Dynamic's account panel. Signed out: a short prompt. */
function CompactAccount() {
  const { setShowDynamicUserProfile, setShowAuthFlow, primaryWallet, user } = useDynamicContext();
  const loggedIn = useIsLoggedIn();

  if (!loggedIn) {
    return (
      <button
        type="button"
        onClick={() => setShowAuthFlow(true)}
        className="inline-flex h-10 flex-none items-center rounded-full bg-panel px-4 text-[13px] font-semibold text-panel-ink"
      >
        Sign in
      </button>
    );
  }

  const label = user?.email ?? primaryWallet?.address ?? "Your account";
  const initial = (user?.email?.[0] ?? primaryWallet?.address?.[2] ?? "?").toUpperCase();

  return (
    <button
      type="button"
      onClick={() => setShowDynamicUserProfile(true)}
      aria-label={`Your account, ${label}`}
      title={label}
      className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-panel text-[13px] font-semibold text-panel-ink"
    >
      {initial}
    </button>
  );
}
