"use client";

/**
 * The states before there is a plan worth showing.
 *
 * Each one says what is missing and what to do about it. The alternative — rendering the real
 * screen with zeroes in it — looks like the product is broken, or worse, like the money is gone.
 */
import type { ReactNode } from "react";
import { Button, Empty, Loading, Notice } from "./ui";
import { WalletButton } from "./wallet-button";
import { usePortfolio } from "./portfolio-provider";

export function PortfolioGate({ children }: { children: ReactNode }) {
  const {
    address,
    signedIn,
    walletConfigured,
    status,
    needsPlan,
    plan,
    loading,
    error,
    refresh,
  } = usePortfolio();

  if (!walletConfigured) {
    return (
      <Notice tone="warn" title="Signing in isn't set up on this deployment">
        Sign-in must be configured before you can approve a plan or add money.
        You can still preview a plan from the questions.
      </Notice>
    );
  }

  if (!signedIn) {
    return (
      <Empty title="Sign in to see your money" action={<WalletButton signIn />}>
        Modalis sets up an account only you control. There&rsquo;s nothing to
        install.
      </Empty>
    );
  }

  if (signedIn && !address) {
    return (
      <Notice tone="warn" title="Your account is still being prepared">
        Wait for your wallet to finish opening. If this continues, open your
        account and sign in again.
      </Notice>
    );
  }

  if (status && !status.ready) {
    return (
      <Notice tone="breach" title="Modalis isn't set up on this network">
        {status.capabilities.limitations[0] ?? "Try again shortly."}
      </Notice>
    );
  }

  if (loading && !plan) return <Loading label="Loading your plan" />;

  if (needsPlan) {
    return (
      <Empty
        title="You don't have a plan yet"
        action={<Button href="/onboarding">Build my plan</Button>}
      >
        Tell Modalis what you&rsquo;re saving for and it will put a plan
        together for you to approve. It takes about two minutes.
      </Empty>
    );
  }

  if (error && !plan) {
    return (
      <Notice
        tone="breach"
        title="We couldn't load your plan"
        action={
          <Button onClick={() => void refresh()} variant="secondary">
            Try again
          </Button>
        }
      >
        {error}
      </Notice>
    );
  }
  if (!plan) return null;

  if (error && plan && !loading) {
    return (
      <>
        <Notice
          tone="warn"
          title="Some live information is unavailable"
          action={
            <Button variant="secondary" onClick={() => void refresh()}>
              Refresh
            </Button>
          }
        >
          {error}
        </Notice>
        <div className="mt-5">{children}</div>
      </>
    );
  }
  return <>{children}</>;
}
