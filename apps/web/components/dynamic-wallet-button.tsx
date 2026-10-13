"use client";
import { useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
export function ConfiguredWalletButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  return <CompactAccount compact={compact} />;
}
/** Signed in: a round button that opens Dynamic's account panel. Signed out: a short prompt. */
function CompactAccount({ compact }: { compact: boolean }) {
  const { setShowDynamicUserProfile, setShowAuthFlow, primaryWallet, user } =
    useDynamicContext();
  const loggedIn = useIsLoggedIn();

  if (!loggedIn) {
    return (
      <button
        type="button"
        onClick={() => setShowAuthFlow(true)}
        className="inline-flex h-11 flex-none items-center rounded-full bg-panel px-4 text-[13px] font-semibold text-panel-ink"
      >
        Enter testnet demo
      </button>
    );
  }

  const label = user?.email ?? primaryWallet?.address ?? "Your account";
  const initial = (
    user?.email?.[0] ??
    primaryWallet?.address?.[2] ??
    "?"
  ).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => setShowDynamicUserProfile(true)}
      aria-label={`Your account, ${label}`}
      title={label}
      className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full bg-panel text-[13px] font-semibold text-panel-ink"
    >
      {compact ? initial : "Demo account"}
    </button>
  );
}
