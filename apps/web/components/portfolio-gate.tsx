"use client";

/**
 * The states before a person has a plan worth showing.
 *
 * Each says what is missing and what to do about it, rather than rendering an empty panel that
 * looks broken.
 */
import type { ReactNode } from "react";
import { Button, Empty, Notice } from "./ui";
import { usePortfolio } from "./portfolio-provider";

export function PortfolioGate({ children }: { children: ReactNode }) {
  const { signedIn, walletConfigured, status, needsPlan, plan, loading, error } = usePortfolio();

  if (!walletConfigured) {
    return (
      <Notice tone="warn" title="Signing in isn't set up yet">
        Set <code>NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID</code> to let people sign in. Everything else
        is running.
      </Notice>
    );
  }

  if (!signedIn) {
    return (
      <Empty title="Sign in to see your plan">
        Use <strong>Continue with email</strong> at the top of the page. Modalis sets up an account
        you own — nothing to install.
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

  if (loading && !plan) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    );
  }

  if (needsPlan) {
    return (
      <Empty title="You don't have a plan yet">
        <span className="block">
          Tell Modalis what you're saving for and it will build a plan for you to approve.
        </span>
        <span className="mt-5 block">
          <Button href="/onboarding">Get started</Button>
        </span>
      </Empty>
    );
  }

  if (error && !plan) return <Notice tone="breach">{error}</Notice>;
  if (!plan) return null;

  return <>{children}</>;
}
