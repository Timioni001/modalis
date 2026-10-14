"use client";

import dynamic from "next/dynamic";
import { Badge, Button, Card, KeyValue, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { WalletButton } from "@/components/wallet-button";
import { useWallet } from "@/components/wallet-context";
import { shortAddress } from "@/lib/format";

const DynamicProfileActions = dynamic(
  () =>
    import("@/components/dynamic-wallet-button").then(
      (module) => module.ProfileAccountActions,
    ),
  {
    ssr: false,
    loading: () => (
      <span className="text-sm text-ink-muted">Loading account actions…</span>
    ),
  },
);

/**
 * A wallet-first account page that does not depend on a saved plan.
 *
 * People can reach this from the public navigation before onboarding. Plan
 * creation remains a separate product action; account access should never be
 * gated behind it.
 */
export default function ProfilePage() {
  const {
    address,
    chainId,
    configured,
    localDevelopment,
    loggedIn,
    networkName,
  } = useWallet();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Your profile"
        lede="Manage your sign-in and wallet account before you create a plan."
        action={<WalletButton signIn />}
      />

      {!configured ? (
        <Notice tone="warn" title="Account sign-in is not configured">
          This deployment is in preview mode. You can explore Modalis, but a
          wallet account is not available here yet.
        </Notice>
      ) : !loggedIn ? (
        <Notice tone="default" title="Sign in to view your profile">
          Your profile is private to your wallet account. Sign in to see your
          address, network and account controls.
          <div className="mt-4">
            <WalletButton signIn />
          </div>
        </Notice>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionTitle hint="This is the account Modalis recognises as the owner of your plan.">
                Account
              </SectionTitle>
              <Badge tone="ok" dot>
                Connected
              </Badge>
            </div>

            <dl>
              <KeyValue label="Wallet">
                <span title={address ?? undefined}>
                  {address ? shortAddress(address) : "Preparing…"}
                </span>
              </KeyValue>
              <KeyValue label="Network">
                {networkName} ({chainId})
              </KeyValue>
              <KeyValue label="Account access">
                {localDevelopment ? "Local development account" : "Dynamic sign-in"}
              </KeyValue>
            </dl>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {localDevelopment ? (
                <p className="text-sm text-ink-muted">
                  Local accounts are unlocked for development and cannot be
                  signed out from the browser.
                </p>
              ) : (
                <DynamicProfileActions />
              )}
              <Button href="/app/settings" variant="quiet">
                Account settings
              </Button>
            </div>
          </Card>

          <Card className="bg-sunken shadow-none">
            <SectionTitle hint="Your profile is separate from your goals and plans.">
              Your plans
            </SectionTitle>
            <p className="text-sm leading-relaxed text-ink-soft">
              Create or manage goals from the app. You can keep multiple goals
              and plans under this account without changing your sign-in.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button href="/app" variant="secondary">
                Open my plans
              </Button>
              <Button href="/onboarding" variant="quiet">
                Create a plan
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
