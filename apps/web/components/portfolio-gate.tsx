"use client";

/**
 * The states before there is a plan worth showing.
 *
 * Each one says what is missing and what to do about it. The alternative — rendering the real
 * screen with zeroes in it — looks like the product is broken, or worse, like the money is gone.
 */
import type { ReactNode } from "react";
import { Button, Empty, Loading, Notice } from "./ui";
import { usePortfolio } from "./portfolio-provider";

export function PortfolioGate({ children }: { children: ReactNode }) {
  const { signedIn, walletConfigured, status, needsPlan, plan, loading, error } = usePortfolio();

  if (!walletConfigured) {
    return (
      <Notice tone="warn" title="Signing in isn't set up on this deployment">
        Everything else is running. Once a sign-in provider is configured, you can create a plan
        and add money.
      </Notice>
    );
  }

  if (!signedIn) {
    return (
      <Empty
        title="Sign in to see your money"
        action={
          <p className="text-sm text-ink-muted">
            Use <strong className="text-ink">Continue with email</strong> at the top of the page.
          </p>
        }
      >
        Modalis sets up an account only you control. There&rsquo;s nothing to install.
      </Empty>
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
        Tell Modalis what you&rsquo;re saving for and it will put a plan together for you to
        approve. It takes about two minutes.
      </Empty>
    );
  }

  if (error && !plan) {
    return (
      <Notice tone="breach" title="We couldn't load your plan">
        {error}
      </Notice>
    );
  }
  if (!plan) return null;

  return <>{children}</>;
}
