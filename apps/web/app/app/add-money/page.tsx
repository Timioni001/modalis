"use client";

/**
 * Adding money.
 *
 * The product promise is "a plan that manages itself", and this is the screen where a person
 * hands it something to manage. So it has to be the least mysterious screen in the app.
 *
 * The split of work here is the security model, not a convenience:
 *
 *  - The SERVER works out WHAT should happen. It reads the plan's own targets, converts the
 *    dollar amount into each investment at live prices, and checks the person actually holds
 *    enough — before anything is signed.
 *  - The PERSON'S OWN ACCOUNT does it. Every step is signed by them. No Modalis key can move
 *    their money in, which is the same reason no Modalis key can move it out.
 *
 * So the worst a compromised Modalis server could do here is propose a funding plan the person
 * would still have to approve, step by step, seeing each amount.
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { approveToken, deposit } from "@modalis/chain";
import type { FundingPlan, FundingStep } from "@modalis/domain";
import type { Address, Hex } from "viem";
import { Badge, Button, Card, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { ReceiptLink } from "@/components/receipt-link";
import { useWallet, useWalletConfig } from "@/components/wallet-context";
import { apiPostOnce } from "@/lib/client-api";
import { moneyLabel, percent } from "@/lib/format";

export default function AddMoneyPage() {
  return (
    <PortfolioGate>
      <AddMoney />
    </PortfolioGate>
  );
}

const QUICK_AMOUNTS = ["250", "500", "1000", "5000"];

function AddMoney() {
  const router = useRouter();
  const { chainId } = useWalletConfig();
  const { loggedIn, getWalletClient } = useWallet();
  const { plan, money, status, refresh } = usePortfolio();

  const [amount, setAmount] = useState("500");
  const [funding, setFunding] = useState<FundingPlan | null>(null);
  const [steps, setSteps] = useState<FundingStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [finished, setFinished] = useState(false);

  const valid = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
  const done = steps.length > 0 && steps.every((s) => s.status === "done");

  /** Ask the server what should happen. Nothing is signed by this. */
  const workItOut = useCallback(async () => {
    setError(null);
    setWorking(true);
    setFinished(false);
    try {
      const { funding: built } = await apiPostOnce<{ funding: FundingPlan }>(
        "/api/money/funding-plan",
        { amount: amount.trim() },
      );
      setFunding(built);
      setSteps(built.steps);
    } catch (err) {
      setFunding(null);
      setSteps([]);
      setError(err instanceof Error ? err.message : "We couldn't work out how to add that.");
    } finally {
      setWorking(false);
    }
  }, [amount]);

  /**
   * Walk the steps in order, signing each one.
   *
   * Each step is recorded only after it has settled, and the server re-checks the receipt
   * on-chain before believing it — a receipt posted by anyone else is refused.
   */
  const run = useCallback(async () => {
    if (!funding) return;
    setError(null);
    setWorking(true);
    try {
      const wallet = await getWalletClient();
      const contracts = (status?.technical?.contracts ?? {}) as Record<string, Address>;
      if (!contracts.portfolioVault) throw new Error("Modalis isn't set up on this network yet.");
      const deployment = {
        chainId,
        contracts,
        tokens: (status?.technical?.tokens ?? {}) as Record<string, Address>,
      };

      for (const step of funding.steps) {
        if (steps.find((s) => s.id === step.id)?.status === "done") continue;
        mark(step.id, { status: "in_progress", error: undefined });
        try {
          const units = BigInt(step.rawUnits);
          const hash: Hex =
            step.kind === "allow"
              ? await approveToken(wallet, deployment, step.holdingId as Address, units)
              : await deposit(wallet, deployment, step.holdingId as Address, units);

          mark(step.id, {
            status: "done",
            receipt: { reference: hash, confirmed: true, at: new Date().toISOString() },
          });

          // Recorded under a one-time key, so a retry after a dropped connection replays the
          // first answer instead of writing the same deposit twice.
          await apiPostOnce("/api/money/confirm", { receipt: hash, kind: step.kind }).catch(
            () => undefined,
          );
        } catch (err) {
          mark(step.id, {
            status: "failed",
            error: err instanceof Error ? err.message : "That step didn't go through.",
          });
          throw err;
        }
      }

      setFinished(true);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Anything that already went through is safely in your plan.`
          : "Something didn't go through.",
      );
    } finally {
      setWorking(false);
    }

    function mark(id: string, patch: Partial<FundingStep>) {
      setSteps((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    }
  }, [funding, steps, getWalletClient, chainId, status, refresh]);

  const where = useMemo(() => plan?.howMoneyIsSpread ?? [], [plan]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Add money"
        lede="Modalis splits whatever you add the way your plan says, so your money lands on plan rather than needing an adjustment straight away."
      />

      {money && !money.isEmpty ? (
        <p className="text-sm text-ink-muted">
          You have {moneyLabel(money.total)} in your plan today.
        </p>
      ) : null}

      {/* ------------------------------------------------------- how much */}
      <Card>
        <SectionTitle>How much would you like to add?</SectionTitle>
        <div className="flex items-center rounded-2xl bg-sunken focus-within:shadow-[0_0_0_2px_var(--color-ink)]">
          <span className="pl-5 text-[22px] text-ink-muted">$</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setFunding(null);
              setSteps([]);
              setFinished(false);
            }}
            className="numeric w-full bg-transparent px-2 py-4 text-[28px] font-semibold text-ink outline-none"
            aria-label="Amount to add, in dollars"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAmount(a);
                setFunding(null);
                setSteps([]);
                setFinished(false);
              }}
              className={`min-h-[42px] rounded-full px-4 text-[14px] font-semibold transition-colors ${
                amount === a
                  ? "bg-panel text-panel-ink"
                  : "bg-sunken text-ink-soft hover:bg-line hover:text-ink"
              }`}
            >
              ${Number(a).toLocaleString("en-US")}
            </button>
          ))}
        </div>

        {where.length > 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            It will go in as {where.map((h) => `${percent(h.sharePercent)} ${h.name}`).join(", ")}.
          </p>
        ) : null}

        <div className="mt-5">
          <Button onClick={workItOut} disabled={!valid || working || !status?.capabilities.canFund}>
            {working && !funding ? "Working it out…" : "Work out the steps"}
          </Button>
          {!status?.capabilities.canFund ? (
            <p className="mt-3 text-xs text-ink-muted">
              {status?.capabilities.limitations[0] ?? "Adding money isn't available right now."}
            </p>
          ) : null}
        </div>
      </Card>

      {error ? <Notice tone="breach">{error}</Notice> : null}

      {/* --------------------------------------------------------- the steps */}
      {funding ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle hint="You confirm each one. Modalis cannot do any of this for you.">
              {`Adding ${moneyLabel(funding.total)}`}
            </SectionTitle>
            <Badge tone={done ? "ok" : "default"}>
              {steps.filter((s) => s.status === "done").length} of {steps.length} done
            </Badge>
          </div>

          {funding.hasShortfall ? (
            <Notice tone="warn" title="You don't have enough of everything yet">
              <ul className="space-y-1">
                {funding.shortfalls.map((s) => (
                  <li key={s.holdingName} className="numeric">
                    {s.holdingName}: this needs {s.needs}, you have {s.has}.
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                You can still add the rest; the steps you can&apos;t cover will simply not go
                through.
              </p>
            </Notice>
          ) : null}

          <ol className="mt-4 space-y-px overflow-hidden rounded-2xl bg-line">
            {steps.map((step, i) => (
              <li key={step.id} className="flex items-start justify-between gap-4 bg-surface px-4 py-4">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      step.status === "done"
                        ? "bg-ok-soft text-ok"
                        : step.status === "failed"
                          ? "bg-breach-soft text-breach"
                          : "bg-sunken text-ink-muted"
                    }`}
                  >
                    {step.status === "done" ? "✓" : i + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-ink">{step.description}</div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {moneyLabel(step.value)}
                      {step.receipt ? (
                        <>
                          {" · "}
                          <ReceiptLink reference={step.receipt.reference} />
                        </>
                      ) : null}
                    </div>
                    {step.error ? (
                      <div className="mt-1 text-xs text-breach">{step.error}</div>
                    ) : null}
                  </div>
                </div>
                <Badge
                  tone={
                    step.status === "done"
                      ? "ok"
                      : step.status === "failed"
                        ? "breach"
                        : step.status === "in_progress"
                          ? "accent"
                          : "default"
                  }
                >
                  {stepLabel(step.status)}
                </Badge>
              </li>
            ))}
          </ol>

          {finished || done ? (
            <Notice tone="ok" title="Your money is in your plan">
              Modalis is managing it to the limits you approved. You can see it on your plan now.
            </Notice>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {done ? (
              <Button onClick={() => router.push("/app/money")}>See my plan</Button>
            ) : (
              <Button onClick={run} disabled={working || !loggedIn}>
                {working
                  ? "Waiting for you to confirm…"
                  : steps.some((s) => s.status === "failed")
                    ? "Try the rest again"
                    : `Add ${moneyLabel(funding.total)}`}
              </Button>
            )}
            <Button variant="quiet" href="/app">
              Not now
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function stepLabel(status: FundingStep["status"]): string {
  return status === "done"
    ? "Done"
    : status === "in_progress"
      ? "Confirm it"
      : status === "failed"
        ? "Didn't go through"
        : "Waiting";
}
