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
import {
  setManager as setManagerOnChain,
  setMandate,
  type MandateParams,
} from "@modalis/chain";
import type { Plan } from "@modalis/domain";
import type { Address, Hex } from "viem";
import { motion } from "motion/react";
import { Meteors } from "@/components/shadcn/meteors";
import {
  Badge,
  Button,
  Card,
  KeyValue,
  Notice,
  Row,
  Rows,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { useWallet, useWalletConfig } from "@/components/wallet-context";
import { ConfirmedIn } from "@/components/confirmed-in";
import { confirmOnChain } from "@/lib/chain-client";
import { loadAnswers } from "@/lib/goal-answers";
import { apiGet, apiPost } from "@/lib/client-api";
import { monthsToHuman, percent, usdFromDecimal } from "@/lib/format";
import { ReceiptLink } from "@/components/receipt-link";
import { SavingsPreferencesSummary } from "@/components/savings-preferences";
import type { SystemStatus } from "@/lib/api-types";
import { walletActionMessage } from "@/lib/wallet-error";

/**
 * What the person's wallet signs to make the plan real.
 *
 * Opaque to this screen on purpose: it is handed back to the chain call unchanged. The two 1e18
 * fields cross the wire as decimal strings, so they are read back with BigInt — never with
 * Number, which would lose precision.
 */
type Approval = {
  params: Record<keyof MandateParams, string | number>;
  allocations: {
    token: string;
    targetBps: number;
    minBps: number;
    maxBps: number;
  }[];
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
  const { configured, chainId, rpcUrl } = useWalletConfig();
  const { loggedIn, address, getWalletClient } = useWallet();

  const [data, setData] = useState<DraftResponse | null>(null);
  const [goalSaved, setGoalSaved] = useState<boolean | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "signing" | "done">("idle");
  const [receipts, setReceipts] = useState<
    { label: string; hash: Hex; ms?: number }[]
  >([]);

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
        setError(
          err instanceof Error
            ? err.message
            : "We couldn't build a plan from those answers.",
        );
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
      const contracts = (status.technical?.contracts ?? {}) as Record<
        string,
        Address
      >;
      if (!contracts.portfolioMandate)
        throw new Error("Modalis isn't set up on this network yet.");

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
      const planConfirmed = await confirmOnChain(planHash, { chainId, rpcUrl });
      setReceipts((r) => [
        ...r,
        { label: "Plan approved", hash: planHash, ms: planConfirmed.ms },
      ]);

      // Let Modalis RECOMMEND adjustments. This grants no power to withdraw and no power to
      // change the rules; both are refused for anyone but the owner, by the rules themselves.
      const manager = status.technical?.managerAddress;
      if (manager) {
        try {
          const managerHash = await setManagerOnChain(
            wallet,
            deployment,
            manager as Address,
          );
          const managerConfirmed = await confirmOnChain(managerHash, {
            chainId,
            rpcUrl,
          });
          setReceipts((r) => [
            ...r,
            {
              label: "Adjustments allowed",
              hash: managerHash,
              ms: managerConfirmed.ms,
            },
          ]);
        } catch {
          setSaveNote(
            "Your plan is approved. Adjustments weren't enabled; you can enable them in Settings.",
          );
        }
      }

      try {
        const saved = await apiPost<{ saved: boolean; note?: string }>(
          "/api/plan/approve",
          {
            answers,
            goalName: data.plan.goal.name,
            setTxHash: planHash,
          },
        );
        setGoalSaved(Boolean(saved.saved));
        if (!saved.saved)
          setSaveNote(
            saved.note ??
              "Your plan is live, but your goal details could not be saved.",
          );
      } catch {
        setGoalSaved(false);
        setSaveNote(
          "Your plan is live, but your goal details could not be saved. You can retry below.",
        );
      }

      setState("done");
    } catch (err) {
      setState("idle");
      setError(walletActionMessage(err, "We couldn't approve your plan. Nothing was changed."));
    }
  }, [data, getWalletClient, chainId, rpcUrl]);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <Notice tone="breach" title="We couldn't build your plan">
          {error}
        </Notice>
        <div className="mt-6">
          <Button
            variant="secondary"
            onClick={() => router.push("/onboarding")}
          >
            Back to the questions
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-14">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const { plan } = data;
  const { goal, rules } = plan;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Badge tone="accent">Ready for your approval</Badge>
        <h1 className="display mt-5 text-[32px] font-semibold text-ink sm:text-[42px]">
          This is how Modalis will manage your money.
        </h1>
        <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-soft">
          {plan.summary}
        </p>
      </motion.div>

      {data.understoodAs ? (
        <div className="mt-6">
          <Notice tone="accent" title="What Modalis understood">
            {data.understoodAs}
          </Notice>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- the goal */}
      <section className="mt-8 rounded-[28px] bg-panel p-6 text-panel-ink shadow-[var(--shadow-lift)] sm:p-8">
        <div className="text-[13px] font-semibold uppercase tracking-[0.09em] text-panel-soft">
          Your goal
        </div>
        <div className="numeric mt-4 text-[48px] font-semibold leading-none tracking-[-0.03em] sm:text-[60px]">
          {usdFromDecimal(goal.target.amount, 0)}
        </div>
        <dl className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-[13px] text-panel-soft">You need it by</dt>
            <dd className="numeric mt-1.5 text-[22px] font-semibold">
              {new Date(goal.targetDate).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </dd>
            <dd className="mt-0.5 text-[12.5px] text-panel-soft">
              {monthsToHuman(goal.monthsRemaining)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-panel-soft">You&rsquo;re adding</dt>
            <dd className="numeric mt-1.5 text-[22px] font-semibold">
              {usdFromDecimal(goal.contribution.amount.amount, 0)}
            </dd>
            <dd className="mt-0.5 text-[12.5px] text-panel-soft">
              per {goal.contribution.cadence.replace("ly", "")}
            </dd>
          </div>
        </dl>
      </section>

      {/* --------------------------------------------------------- the limits */}
      {goal.savings ? (
        <Card className="mt-4">
          <SectionTitle hint="Review these separately from the rules your wallet signs.">
            Your savings preferences
          </SectionTitle>
          <SavingsPreferencesSummary savings={goal.savings} />
        </Card>
      ) : null}

      <Card className="mt-4">
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
      <Card className="mt-4">
        <SectionTitle hint="Each one has a target and a range it has to stay inside.">
          How your money is spread
        </SectionTitle>
        <Rows>
          {plan.howMoneyIsSpread.map((holding) => (
            <Row
              key={holding.id}
              className="flex items-center justify-between gap-4"
            >
              <div>
                <span className="font-semibold text-ink">{holding.name}</span>
                {holding.isAvailableCash ? (
                  <span className="ml-2 text-xs text-ink-muted">
                    stays available to withdraw
                  </span>
                ) : null}
              </div>
              <div className="text-right">
                <div className="numeric font-semibold text-ink">
                  {percent(holding.sharePercent)}
                </div>
                <div className="numeric text-xs text-ink-muted">
                  can move between {percent(holding.allowedRange.minPercent)}{" "}
                  and {percent(holding.allowedRange.maxPercent)}
                </div>
              </div>
            </Row>
          ))}
        </Rows>
      </Card>

      {/* ------------------------------------------------------- the reasoning */}
      <Card className="mt-4 bg-sunken shadow-none">
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
        {saveNote ? (
          <Notice
            tone="warn"
            action={
              state === "done" && goalSaved === false ? (
                <Button
                  variant="secondary"
                  busy={savingDetails}
                  onClick={async () => {
                    const answers = loadAnswers();
                    const receipt = receipts.find(
                      (item) => item.label === "Plan approved",
                    );
                    if (!answers || !receipt) return;
                    setSavingDetails(true);
                    try {
                      const result = await apiPost<{
                        saved: boolean;
                        note?: string;
                      }>("/api/plan/approve", {
                        answers,
                        goalName: data.plan.goal.name,
                        setTxHash: receipt.hash,
                      });
                      setGoalSaved(Boolean(result.saved));
                      setSaveNote(
                        result.saved
                          ? "Your goal details are saved."
                          : (result.note ??
                              "Your goal details could not be saved yet."),
                      );
                    } catch {
                      setSaveNote(
                        "Your plan is live. Saving goal details still failed; try again shortly.",
                      );
                    } finally {
                      setSavingDetails(false);
                    }
                  }}
                >
                  Save goal details
                </Button>
              ) : undefined
            }
          >
            {saveNote}
          </Notice>
        ) : null}
        {state === "done" ? (
          <motion.section
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.34, 1.4, 0.64, 1] }}
            className="relative overflow-hidden rounded-[28px] bg-panel p-7 text-panel-ink shadow-[var(--shadow-float)]"
          >
            {/* The one place in the product that celebrates: a plan going live. */}
            <Meteors
              number={14}
              color="#c8f250"
              trailColor="rgba(200,242,80,0.5)"
              className="pointer-events-none absolute inset-0"
            />
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                delay: 0.12,
                duration: 0.4,
                ease: [0.34, 1.4, 0.64, 1],
              }}
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent"
            >
              <svg
                viewBox="0 0 20 20"
                className="h-6 w-6 text-accent-ink"
                fill="none"
              >
                <path
                  d="M4.5 10.5l3.6 3.6L15.5 6.5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.span>
            <h2 className="display mt-5 text-[26px] font-semibold sm:text-[32px]">
              Your plan is live.
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-panel-soft">
              Your limits are now on record where Modalis has no authority to
              change them. Add money and it starts managing it to this plan.
            </p>
            <ul className="mt-6 space-y-2 text-[13px] text-panel-soft">
              {receipts.map((r) => (
                <li key={r.hash} className="flex flex-wrap items-center gap-2">
                  {r.label}: <ReceiptLink reference={r.hash} />{" "}
                  <ConfirmedIn ms={r.ms} />
                </li>
              ))}
            </ul>
          </motion.section>
        ) : null}

        {error ? <Notice tone="breach">{error}</Notice> : null}

        {!configured ? (
          <Notice
            tone="warn"
            title="Signing in isn't set up on this deployment"
          >
            Your plan is ready, but approving it needs an account to sign with.
          </Notice>
        ) : !loggedIn ? (
          <Notice tone="accent" title="Sign in to approve this plan">
            Use <strong>Continue with email</strong> at the top of the page.
            Modalis will create an account that only you control.
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {state === "done" ? (
            <Button onClick={() => router.push("/app/add-money")}>
              Add money
            </Button>
          ) : (
            <Button
              onClick={approve}
              disabled={!loggedIn || state === "signing"}
            >
              {state === "signing"
                ? "Waiting for you to confirm…"
                : "Approve this plan"}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => router.push("/onboarding")}
          >
            Change my answers
          </Button>
        </div>

        {address ? (
          <p className="text-xs text-ink-muted">
            Approving as {address}. Only this account can change this plan or
            take the money out.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function riskLabel(level: Plan["riskLevel"]["level"]): string {
  return level === "cautious"
    ? "Cautious"
    : level === "balanced"
      ? "Balanced"
      : "Adventurous";
}
