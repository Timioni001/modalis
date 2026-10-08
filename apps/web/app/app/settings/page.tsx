"use client";

/**
 * Account, plan and permissions.
 *
 * The page exists to make authority legible and reversible: the person can see exactly what they
 * have allowed, take it back, pause the plan, or take all their money out. Every one of those is
 * owner-only where it counts, and the exit keeps working even when the plan is paused.
 */
import { useCallback, useState } from "react";
import { emergencyWithdraw, setMandateActive, setManager } from "@modalis/chain";
import type { Address, Hex } from "viem";
import { Badge, Button, Card, KeyValue, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { ReceiptLink } from "@/components/receipt-link";
import { AutomationControl } from "@/components/automation-control";
import { usePortfolio } from "@/components/portfolio-provider";
import { useWallet, useWalletConfig } from "@/components/wallet-context";
import { moneyLabel, percent, shortAddress, usdFromDecimal } from "@/lib/format";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Settings />
    </div>
  );
}

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

type Chain = { chainId: number; contracts: Record<string, Address>; tokens: Record<string, Address> };

function Settings() {
  const { chainId, networkName } = useWalletConfig();
  const { address, loggedIn, configured, getWalletClient } = useWallet();
  const { plan, money, status, refresh } = usePortfolio();

  const [busy, setBusy] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<{ label: string; hash: Hex }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const act = useCallback(
    async (
      label: string,
      fn: (wallet: Awaited<ReturnType<typeof getWalletClient>>, chain: Chain) => Promise<Hex>,
    ) => {
      setBusy(label);
      setError(null);
      try {
        const wallet = await getWalletClient();
        const contracts = (status?.technical?.contracts ?? {}) as Record<string, Address>;
        if (!contracts.portfolioVault) throw new Error("Modalis isn't set up on this network yet.");
        const hash = await fn(wallet, {
          chainId,
          contracts,
          tokens: (status?.technical?.tokens ?? {}) as Record<string, Address>,
        });
        setReceipts((r) => [...r, { label, hash }]);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `We couldn't ${label.toLowerCase()}.`);
      } finally {
        setBusy(null);
      }
    },
    [getWalletClient, chainId, refresh, status],
  );

  const managerAddress = status?.technical?.managerAddress ?? null;
  const adjustmentsAllowed = Boolean(plan?.adjustmentsEnabled);

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" lede="What you have allowed, and how to take it back." />

      {/* ------------------------------------------------------- your account */}
      <Card>
        <SectionTitle>Your account</SectionTitle>
        <dl>
          <KeyValue label="Signed in">{loggedIn ? "Yes" : "No"}</KeyValue>
          <KeyValue label="Account">{address ? shortAddress(address) : "—"}</KeyValue>
          <KeyValue label="Sign-in">{configured ? "Set up" : "Not set up"}</KeyValue>
          <KeyValue label="Network">
            {networkName} ({chainId})
          </KeyValue>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Your account is yours. Modalis never holds the keys to it, and only this account is
          recognised as the owner of your money.
        </p>
      </Card>

      {/* -------------------------------------------------------- permissions */}
      <Card>
        <SectionTitle hint="What you have allowed, and how to take it back.">
          What Modalis is allowed to do
        </SectionTitle>
        <dl>
          <KeyValue label="Suggest adjustments to your plan">
            {adjustmentsAllowed ? "Allowed" : "Not allowed"}
          </KeyValue>
          <KeyValue label="Take money out">Never</KeyValue>
          <KeyValue label="Change your limits">Never</KeyValue>
          <KeyValue label="Your plan">{plan ? planStateLabel(plan.status) : "Not set up yet"}</KeyValue>
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          {adjustmentsAllowed ? (
            <Button
              variant="secondary"
              disabled={busy !== null || !loggedIn}
              onClick={() => act("Stop allowing adjustments", (w, c) => setManager(w, c, ZERO))}
            >
              {busy === "Stop allowing adjustments" ? "Saving…" : "Stop allowing adjustments"}
            </Button>
          ) : managerAddress ? (
            <Button
              variant="secondary"
              disabled={busy !== null || !loggedIn}
              onClick={() =>
                act("Allow adjustments", (w, c) => setManager(w, c, managerAddress as Address))
              }
            >
              {busy === "Allow adjustments" ? "Saving…" : "Allow adjustments"}
            </Button>
          ) : null}

          {plan ? (
            <Button
              variant="secondary"
              disabled={busy !== null || !loggedIn}
              onClick={() =>
                act(plan.status === "paused" ? "Resume my plan" : "Pause my plan", (w, c) =>
                  setMandateActive(w, c, plan.status === "paused"),
                )
              }
            >
              {plan.status === "paused" ? "Resume my plan" : "Pause my plan"}
            </Button>
          ) : null}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Pausing your plan stops all adjustments. Taking money out keeps working while it is
          paused, by design &mdash; a pause must never trap your money.
        </p>
      </Card>

      <AutomationControl />

      {/* ---------------------------------------------------------- your plan */}
      {plan ? (
        <Card>
          <SectionTitle hint={`You have changed this plan ${plan.version} time${plan.version === 1 ? "" : "s"}.`}>
            Your plan
          </SectionTitle>
          <dl>
            <KeyValue label="Your goal">{usdFromDecimal(plan.goal.target.amount, 0)}</KeyValue>
            <KeyValue label="How much you're comfortable losing">
              {percent(plan.rules.comfortableLosingPercent)}
            </KeyValue>
            <KeyValue label="Money kept available">
              {percent(plan.rules.moneyKeptAvailablePercent)}
            </KeyValue>
            <KeyValue label="Maximum in one investment">
              {percent(plan.rules.maxInOneInvestmentPercent)}
            </KeyValue>
            <KeyValue label="Modalis steps in when your plan moves off target by">
              {percent(plan.rules.adjustWhenOffTargetByPercent)}
            </KeyValue>
          </dl>
          <div className="mt-5">
            <Button variant="secondary" href="/onboarding">
              Change my plan
            </Button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Changing your plan replaces the old one. Any adjustment Modalis had already worked out
            against the old limits stops being valid, so nothing out of date can go through.
          </p>
        </Card>
      ) : null}

      {/* ----------------------------------------------------------- the exit */}
      <Card className="shadow-[0_0_0_1.5px_var(--color-breach-soft),var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle hint="Returns everything you hold to your own account, in one go.">
            Take all my money out
          </SectionTitle>
          <Badge tone="breach">Only you can do this</Badge>
        </div>
        {money ? (
          <p className="mb-4 text-sm text-ink-soft">
            You currently have {moneyLabel(money.total)} in your plan.
          </p>
        ) : null}
        <Button
          variant="danger"
          disabled={busy !== null || !loggedIn}
          onClick={() => act("Take all my money out", (w, c) => emergencyWithdraw(w, c))}
        >
          {busy === "Take all my money out" ? "Taking it out…" : "Take all my money out"}
        </Button>
        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          This works even if your plan is paused, and nobody but you can do it. It is the reason
          giving Modalis a plan is not the same as giving it your money.
        </p>
      </Card>

      {error ? <Notice tone="breach">{error}</Notice> : null}
      {receipts.length > 0 ? (
        <Notice tone="ok" title="Done">
          <ul className="space-y-1">
            {receipts.map((r) => (
              <li key={r.hash}>
                {r.label}: <ReceiptLink reference={r.hash} />
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}

function planStateLabel(state: "draft" | "active" | "paused"): string {
  return state === "active" ? "Running" : state === "paused" ? "Paused" : "Not approved yet";
}
