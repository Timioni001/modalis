"use client";

/**
 * Shared empty/loading/unconfigured states for the dashboard pages.
 *
 * Each one says exactly what is missing and what to do about it, rather than showing an empty
 * panel that looks like a bug.
 */
import type { ReactNode } from "react";
import { Button, Empty, Notice } from "./ui";
import { usePortfolio } from "./portfolio-provider";

export function PortfolioGate({ children }: { children: ReactNode }) {
  const { address, loggedIn, walletConfigured, status, portfolio, loading, error } = usePortfolio();

  if (!walletConfigured) {
    return (
      <Notice tone="warn" title="Wallet onboarding is not configured">
        Set <code>NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID</code> to enable email sign-in and the embedded
        Monad wallet. The rest of the app is running.
      </Notice>
    );
  }

  if (!loggedIn || !address) {
    return (
      <Empty title="Sign in to see your portfolio">
        Use <strong>Continue with email</strong> at the top of the page. Modalis creates a Monad
        wallet you own — no extension required.
      </Empty>
    );
  }

  if (status && !status.deployed) {
    return (
      <Notice tone="breach" title="Modalis is not deployed on this chain">
        Run the deploy script and set the contract addresses, then reload.
      </Notice>
    );
  }

  if (loading && !portfolio) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    );
  }

  if (error && !portfolio) {
    return <Notice tone="breach">{error}</Notice>;
  }

  if (portfolio && !portfolio.hasMandate) {
    return (
      <Empty title="You do not have a mandate yet">
        <span className="block">
          A mandate is the policy Modalis manages your portfolio within. Answer a few questions and
          Modalis will build one for you to approve.
        </span>
        <span className="mt-5 block">
          <Button href="/onboarding">Build my portfolio</Button>
        </span>
      </Empty>
    );
  }

  return <>{children}</>;
}
