"use client";

/**
 * The plan approval screen.
 *
 * This is the most important screen in the product. It is where the person sees that they are not
 * handing an AI unlimited authority over their money: they are approving a specific, bounded set
 * of rules, and those rules are enforced where Modalis cannot reach them.
 *
 * Approving is signed by the PERSON'S OWN WALLET. The server never signs a plan — a plan is the
 * boundary on Modalis's own authority, so letting a server key write one would defeat its purpose.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { setManager as setManagerOnChain, setMandate, type MandateParams } from "@modalis/chain";
import type { Plan } from "@modalis/domain";
import type { Address, Hex } from "viem";
import { Badge, Button, Card, KeyValue, Notice, SectionTitle, Stat } from "@/components/ui";
import { useWallet, useWalletConfig } from "@/components/wallet-context";
import { loadAnswers } from "@/lib/goal-answers";
import { apiGet, apiPost } from "@/lib/client-api";
import { monthsToHuman, percent, usdFromDecimal } from "@/lib/format";
import { ReceiptLink } from "@/components/receipt-link";
import type { SystemStatus } from "@/lib/api-types";

/**
 * What the person's wallet signs to make the plan real.
 *
 * Opaque to this screen on purpose: it is handed back to the chain call unchanged. The two 1e18
 * fields cross the wire as decimal strings, so they are read back with BigInt — never with
 * Number, which would lose precision.
 */
type Approval = {
  params: Record<keyof MandateParams, string | number>;
  allocations: { token: string; targetBps: number; minBps: number; maxBps: number }[];
};

type DraftResponse = {
  plan: Plan;
  approval: Approval;
  understoodAs: string | null;
};

function toMandateParams(params: Approval["params"]): MandateParams {
  return {
    targetValue: BigInt(params.targetValue),
    targetDate: BigInt(params.targetDate),
    maxDrawdownBps: Number(params.maxDrawdownBps),
    minLiquidityBps: Number(params.minLiquidityBps),
    rebalanceThresholdBps: Number(params.rebalanceThresholdBps),
    maxSingleAssetBps: Number(params.maxSingleAssetBps),
    maxSlippageBps: Number(params.maxSlippageBps),
  };
}

export default function PlanPage() {
  const router = useRouter();
  const { configured, chainId } = useWalletConfig();
  const { loggedIn, address, getWalletClient } = useWallet();

  const [data, setData] = useState<DraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "signing" | "done">("idle");
  const [receipts, setReceipts] = useState<{ label: string; hash: Hex }[]>([]);

  // --- Build the plan from the answers the person gave.
  useEffect(() => {
    const answers = loadAnswers();
    if (!answers) {
      router.replace("/onboarding");
      return;
    }
    let alive = true;
    apiPost<DraftResponse>("/api/plan/draft", answers)
      .then((json) => alive && setData(json))
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "We couldn't build a plan from those answers.");
      });
    return () => {
      alive = false;
    };
  }, [router]);

  const approve = useCallback(async () => {
    const answers = loadAnswers();
    if (!data || !answers) return;
    setError(null);
    setState("signing");
    try {
      const wallet = await getWalletClient();
      const status = await apiGet<SystemStatus>("/api/status");
      const contracts = (status.technical?.contracts ?? {}) as Record<string, Address>;
      if (!contracts.portfolioMandate) throw new Error("Modalis isn't set up on this network yet.");

      const deployment = {
        chainId,
        contracts,
        tokens: (status.technical?.tokens ?? {}) as Record<string, Address>,
      };

      const planHash = await setMandate(
        wallet,
        deployment,
        toMandateParams(data.approval.params),
        data.approval.allocations.map((a) => ({
          token: a.token as Address,
          targetBps: a.targetBps,
          minBps: a.minBps,
          maxBps: a.maxBps,
        })),
      );
      setReceipts((r) => [...r, { label: "Plan approved", hash: planHash }]);

      // Let Modalis RECOMMEND adjustments. This grants no power to withdraw and no power to
      // change the rules; both are refused for anyone but the owner, by the rules themselves.
      const manager = status.technical?.managerAddress;
      if (manager) {
        const managerHash = await setManagerOnChain(wallet, deployment, manager as Address);
        setReceipts((r) => [...r, { label: "Adjustments allowed", hash: managerHash }]);
      }

      // Save the goal alongside the plan. Optional: skipping it loses the goal's name and
      // history, never the plan, which lives where Modalis cannot rewrite it.
      await apiPost("/api/plan/approve", {
        answers,
        goalName: data.plan.goal.name,
        setTxHash: planHash,
      }).catch(() => undefined);

      setState("done");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "We couldn't approve your plan.");
    }
  }, [data, getWalletClient, chainId]);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <Notice tone="breach" title="We couldn't build your plan">
          {error}
        </Notice>
        <div className="mt-6">
          <Button variant="secondary" onClick={() => router.push("/onboarding")}>
            Back to the questions
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="h-8 w-56 animate-pulse rounded bg-surface-sunken" />
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    );
  }

  const { plan } = data;
  const { goal, rules } = plan;

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <Badge tone="accent">Your plan</Badge>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink">
        This is how Modalis will manage your money.
      </h1>
      <p className="mt-4 text-ink-soft">{plan.summary}</p>

      {data.understoodAs ? (
        <div className="mt-6">
          <Notice tone="accent" title="What Modalis understood">
            {data.understoodAs}
          </Notice>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- the goal */}
      <Card className="mt-8">
        <div className="grid gap-8 sm:grid-cols-3">
          <Stat label="Your goal" value={usdFromDecimal(goal.target.amount, 0)} size="lg" />
          <Stat
            label="You need it by"
            value={new Date(goal.targetDate).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
            size="md"
            sub={monthsToHuman(goal.monthsRemaining)}
          />
          <Stat
            label="You're adding"
            value={usdFromDecimal(goal.contribution.amount.amount, 0)}
            size="md"
            sub={`per ${goal.contribution.cadence.replace("ly", "")}`}
          />
        </div>
      </Card>

      {/* --------------------------------------------------------- the limits */}
      <Card className="mt-5">
        <SectionTitle hint="Modalis can only act inside these. Anything outside them is refused — not by Modalis, but by the rules themselves.">
          The limits you are setting
        </SectionTitle>
        <dl>
          <KeyValue label="How much you're comfortable losing">
            {percent(rules.comfortableLosingPercent)}
          </KeyValue>
          <KeyValue label="Money kept available">
            {percent(rules.moneyKeptAvailablePercent)}
          </KeyValue>
          <KeyValue label="Maximum in one investment">
            {percent(rules.maxInOneInvestmentPercent)}
          </KeyValue>
          <KeyValue label="Modalis steps in when your plan moves off target by">
            {percent(rules.adjustWhenOffTargetByPercent)}
          </KeyValue>
        </dl>
      </Card>

      {/* --------------------------------------------- how money is spread */}
      <Card className="mt-5">
        <SectionTitle hint="Each one has a target and a range it has to stay inside.">
          How your money is spread
        </SectionTitle>
        <ul className="divide-y divide-line">
          {plan.howMoneyIsSpread.map((holding) => (
            <li key={holding.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <span className="font-semibold text-ink">{holding.name}</span>
                {holding.isAvailableCash ? (
                  <span className="ml-2 text-xs text-ink-muted">stays available to withdraw</span>
                ) : null}
              </div>
              <div className="text-right">
                <div className="numeric font-semibold text-ink">
                  {percent(holding.sharePercent)}
                </div>
                <div className="numeric text-xs text-ink-muted">
                  can move between {percent(holding.allowedRange.minPercent)} and{" "}
                  {percent(holding.allowedRange.maxPercent)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------- the reasoning */}
      <Card className="mt-5 bg-surface-sunken">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Why this plan</SectionTitle>
          <Badge tone="default">{riskLabel(plan.riskLevel.level)}</Badge>
        </div>
        <ul className="space-y-2 text-sm text-ink-soft">
          {plan.riskLevel.reasons.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-ink-muted">
                ·
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------------ approve */}
      <div className="mt-8 space-y-4">
        {state === "done" ? (
          <Notice tone="ok" title="Your plan is live">
            <div className="space-y-2">
              <p>Next: add money, and Modalis starts managing it to this plan.</p>
              <ul className="space-y-1">
                {receipts.map((r) => (
                  <li key={r.hash}>
                    {r.label}: <ReceiptLink reference={r.hash} />
                  </li>
                ))}
              </ul>
            </div>
          </Notice>
        ) : null}

        {error ? <Notice tone="breach">{error}</Notice> : null}

        {!configured ? (
          <Notice tone="warn" title="Signing in isn't set up on this deployment">
            Your plan is ready, but approving it needs an account to sign with.
          </Notice>
        ) : !loggedIn ? (
          <Notice tone="accent" title="Sign in to approve this plan">
            Use <strong>Continue with email</strong> at the top of the page. Modalis will create an
            account that only you control.
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {state === "done" ? (
            <Button onClick={() => router.push("/app/add-money")}>Add money</Button>
          ) : (
            <Button onClick={approve} disabled={!loggedIn || state === "signing"}>
              {state === "signing" ? "Waiting for you to confirm…" : "Approve this plan"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => router.push("/onboarding")}>
            Change my answers
          </Button>
        </div>

        {address ? (
          <p className="text-xs text-ink-muted">
            Approving as {address}. Only this account can change this plan or take the money out.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function riskLabel(level: Plan["riskLevel"]["level"]): string {
  return level === "cautious" ? "Cautious" : level === "balanced" ? "Balanced" : "Adventurous";
}
