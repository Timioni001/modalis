"use client";

/**
 * Taking some money out.
 *
 * The person sees what it costs BEFORE signing: which goal it comes out of, how much later that
 * goal arrives, and whether the money kept easy to withdraw stays above their plan's floor. Then
 * their own wallet signs each step. The vault only ever lets an owner withdraw their own balance,
 * and it works even while the plan is paused.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { withdraw } from "@modalis/chain";
import type { WithdrawalPlan, WithdrawalStep } from "@modalis/domain";
import type { Address, Hex } from "viem";
import { Badge, Button, Card, MoneyField, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { ReceiptLink } from "@/components/receipt-link";
import { ConfirmedIn } from "@/components/confirmed-in";
import { confirmOnChain } from "@/lib/chain-client";
import { useWallet, useWalletConfig } from "@/components/wallet-context";
import { ApiError, apiPostOnce } from "@/lib/client-api";
import { moneyLabel } from "@/lib/format";

export default function WithdrawPage() {
  return (
    <PortfolioGate>
      <Withdraw />
    </PortfolioGate>
  );
}

function Withdraw() {
  const { chainId, rpcUrl } = useWalletConfig();
  const { loggedIn, getWalletClient } = useWallet();
  const { money, status, refresh } = usePortfolio();

  const [amount, setAmount] = useState(500);
  const [plan, setPlan] = useState<WithdrawalPlan | null>(null);
  const [steps, setSteps] = useState<WithdrawalStep[]>([]);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Hex[]>([]);
  const [times, setTimes] = useState<Record<string, number>>({});

  const done = steps.length > 0 && steps.every((s) => s.status === "done");

  async function workItOut() {
    setProblem(null);
    setWorking(true);
    try {
      const { withdrawal } = await apiPostOnce<{ withdrawal: WithdrawalPlan }>("/api/money/withdrawal-plan", {
        amount: String(amount),
      });
      setPlan(withdrawal);
      setSteps(withdrawal.steps);
    } catch (err) {
      setPlan(null);
      setSteps([]);
      setProblem(err instanceof ApiError ? err.message : "We couldn't work that out.");
    } finally {
      setWorking(false);
    }
  }

  const run = useCallback(async () => {
    if (!plan) return;
    setProblem(null);
    setWorking(true);
    const mark = (id: string, patch: Partial<WithdrawalStep>) =>
      setSteps((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      const wallet = await getWalletClient();
      const contracts = (status?.technical?.contracts ?? {}) as Record<string, Address>;
      if (!contracts.portfolioVault) throw new Error("Modalis isn't set up on this network yet.");
      const deployment = { chainId, contracts, tokens: (status?.technical?.tokens ?? {}) as Record<string, Address> };

      for (const step of plan.steps) {
        if (steps.find((s) => s.id === step.id)?.status === "done") continue;
        mark(step.id, { status: "in_progress" });
        try {
          const hash: Hex = await withdraw(wallet, deployment, step.holdingId as Address, BigInt(step.rawUnits));
          const confirmed = await confirmOnChain(hash, { chainId, rpcUrl });
          setTimes((t) => ({ ...t, [hash]: confirmed.ms }));
          mark(step.id, { status: "done" });
          setReceipts((r) => [...r, hash]);
          await apiPostOnce("/api/money/confirm", { receipt: hash, kind: "withdraw" }).catch(() => undefined);
        } catch (err) {
          mark(step.id, { status: "failed" });
          throw err;
        }
      }
      toast.success(`${moneyLabel(plan.total)} is on its way back to your account.`);
      await refresh();
    } catch (err) {
      setProblem(
        `${err instanceof Error ? err.message : "Something didn't go through."} Anything already withdrawn is in your account.`,
      );
    } finally {
      setWorking(false);
    }
  }, [plan, steps, getWalletClient, chainId, rpcUrl, status, refresh]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Take money out"
        lede="See what it costs your goals first. Your own account signs it; nobody else can."
      />

      <Card>
        <SectionTitle>How much?</SectionTitle>
        <MoneyField
          id="withdraw-amount"
          value={amount}
          max={100_000_000}
          onChange={(v) => {
            setAmount(v);
            setPlan(null);
            setSteps([]);
          }}
        />
        {money ? (
          <p className="mt-3 text-[13.5px] text-ink-muted">You have {moneyLabel(money.total)} in your plan.</p>
        ) : null}
        <div className="mt-5">
          <Button onClick={workItOut} busy={working && !plan} busyLabel="Working it out…" disabled={amount <= 0}>
            See what it costs
          </Button>
        </div>
      </Card>

      {problem ? <Notice tone="warn">{problem}</Notice> : null}

      {plan ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle>{`Taking out ${moneyLabel(plan.total)}`}</SectionTitle>
            <Badge tone={plan.keepsAvailableFloor ? "ok" : "warn"} dot>
              {plan.keepsAvailableFloor ? "Stays inside your plan" : "Goes below your floor"}
            </Badge>
          </div>

          <ul className="space-y-2">
            {plan.consequences.map((c) => (
              <li key={c} className="rounded-2xl bg-sunken px-4 py-3 text-[14.5px] leading-relaxed text-ink">{c}</li>
            ))}
          </ul>

          <ol className="mt-5 space-y-px overflow-hidden rounded-2xl bg-line">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 bg-surface px-4 py-3.5">
                <div>
                  <div className="text-[14px] font-medium text-ink">{s.description}</div>
                  <div className="numeric mt-0.5 text-xs text-ink-muted">{moneyLabel(s.value)}</div>
                </div>
                <Badge tone={s.status === "done" ? "ok" : s.status === "failed" ? "breach" : s.status === "in_progress" ? "accent" : "default"}>
                  {s.status === "done" ? "Done" : s.status === "failed" ? "Didn't go through" : s.status === "in_progress" ? "Confirm it" : "Waiting"}
                </Badge>
              </li>
            ))}
          </ol>

          {receipts.length > 0 ? (
            <p className="mt-3 flex flex-wrap gap-2 text-ink-muted">
              {receipts.map((r) => (
                <span key={r} className="mr-2 inline-flex items-center gap-1">
                  <ReceiptLink reference={r} />
                  <ConfirmedIn ms={times[r]} />
                </span>
              ))}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            {done ? (
              <Button href="/app/money">See my money</Button>
            ) : (
              <Button variant="dark" onClick={run} busy={working} busyLabel="Waiting for you to confirm…" disabled={!loggedIn}>
                {`Take out ${moneyLabel(plan.total)}`}
              </Button>
            )}
            <Button variant="quiet" href="/app/settings">Take everything out instead</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
