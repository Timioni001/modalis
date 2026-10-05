"use client";

/**
 * "What if?"
 *
 * Asks a question a person actually has — "what if I add more each month?", "what if I need it a
 * year sooner?" — and answers it by rebuilding the plan under the new assumption and showing what
 * moves.
 *
 * Deliberately return-free. Every figure assumes ZERO growth, so the answer is framed as what the
 * person's own contributions cover, never as a projected return. It writes nothing: changing a
 * real plan needs their approval.
 */
import { useEffect, useMemo, useState } from "react";
import type { GoalAnswers, Plan } from "@modalis/domain";
import { Badge, Button, Card, KeyValue, Notice, SectionTitle } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { DEFAULT_ANSWERS, loadAnswers } from "@/lib/goal-answers";
import { apiPost } from "@/lib/client-api";
import { monthsToHuman, percent, usdFromDecimal } from "@/lib/format";

type Comparison = { current: Plan; changed: Plan; note: string };

const PRESETS: { id: string; label: string; apply: (a: GoalAnswers) => Partial<GoalAnswers> }[] = [
  {
    id: "more",
    label: "Add $100 more each month",
    apply: (a) => ({ contributionAmount: a.contributionAmount + 100 }),
  },
  {
    id: "sooner",
    label: "Need it a year sooner",
    apply: (a) => ({ monthsUntilNeeded: Math.max(6, a.monthsUntilNeeded - 12) }),
  },
  {
    id: "later",
    label: "Give it a year longer",
    apply: (a) => ({ monthsUntilNeeded: a.monthsUntilNeeded + 12 }),
  },
  {
    id: "safer",
    label: "Only comfortable losing 10%",
    apply: () => ({ comfortableLosingPercent: 10 }),
  },
  {
    id: "bigger",
    label: "Raise my goal by 50%",
    apply: (a) => ({ targetAmount: Math.round(a.targetAmount * 1.5) }),
  },
];

export default function ScenariosPage() {
  return (
    <PortfolioGate>
      <Scenarios />
    </PortfolioGate>
  );
}

function Scenarios() {
  const { plan } = usePortfolio();

  // Start from the answers the person gave when they still have them, otherwise reconstruct a
  // starting point from their live plan so the page works for someone coming back later.
  const answers: GoalAnswers = useMemo(() => {
    const stored = loadAnswers();
    if (stored) return stored;
    if (!plan) return DEFAULT_ANSWERS;
    return {
      ...DEFAULT_ANSWERS,
      goalKind: plan.goal.kind,
      targetAmount: Math.round(Number(plan.goal.target.amount)),
      startingAmount: Math.round(Number(plan.goal.startingAmount.amount)),
      contributionAmount: Math.round(Number(plan.goal.contribution.amount.amount)),
      contributionCadence: plan.goal.contribution.cadence,
      monthsUntilNeeded: Math.max(1, plan.goal.monthsRemaining),
      comfortableLosingPercent: Math.round(plan.rules.comfortableLosingPercent),
    };
  }, [plan]);

  const [selected, setSelected] = useState(PRESETS[0].id);
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changes = useMemo(() => {
    const preset = PRESETS.find((p) => p.id === selected) ?? PRESETS[0];
    return preset.apply(answers);
  }, [answers, selected]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    apiPost<Comparison>("/api/plan/compare", { answers, changes })
      .then((d) => alive && setResult(d))
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "We couldn't work that out.");
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [answers, changes]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">What if?</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Change one thing and see what Modalis would do differently. Nothing here touches your
          real plan &mdash; that needs your approval.
        </p>
      </div>

      <Card>
        <SectionTitle>Pick a change</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                selected === p.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-ink hover:bg-surface-sunken"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {error ? <Notice tone="warn">{error}</Notice> : null}
      {busy && !result ? <div className="h-72 animate-pulse rounded-2xl bg-surface-sunken" /> : null}

      {result ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <SideCard title="Your plan today" plan={result.current} answers={answers} tone="default" />
            <SideCard
              title="With that change"
              plan={result.changed}
              answers={{ ...answers, ...changes }}
              tone="accent"
            />
          </div>

          <Card className="bg-surface-sunken">
            <SectionTitle>What actually changes</SectionTitle>
            <ul className="space-y-2 text-sm text-ink-soft">
              {describeDiff(result).map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-ink-muted">
                    ·
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Notice tone="default" title="How to read these numbers">
            {result.note}
          </Notice>
        </>
      ) : null}
    </div>
  );
}

function SideCard({
  title,
  plan,
  answers,
  tone,
}: {
  title: string;
  plan: Plan;
  answers: GoalAnswers;
  tone: "default" | "accent";
}) {
  return (
    <Card className={tone === "accent" ? "border-accent/40" : ""}>
      <div className="flex items-center justify-between">
        <SectionTitle>{title}</SectionTitle>
        <Badge tone="default">{plan.riskLevel.level}</Badge>
      </div>

      <dl>
        <KeyValue label="Your goal">{usdFromDecimal(plan.goal.target.amount, 0)}</KeyValue>
        <KeyValue label="Time you have">{monthsToHuman(answers.monthsUntilNeeded)}</KeyValue>
        <KeyValue label="You're adding">
          ${answers.contributionAmount.toLocaleString("en-US")} per{" "}
          {answers.contributionCadence.replace("ly", "")}
        </KeyValue>
        <KeyValue label="How much you're comfortable losing">
          {percent(plan.rules.comfortableLosingPercent)}
        </KeyValue>
        <KeyValue label="Money kept available">
          {percent(plan.rules.moneyKeptAvailablePercent)}
        </KeyValue>
        <KeyValue label="Maximum in one investment">
          {percent(plan.rules.maxInOneInvestmentPercent)}
        </KeyValue>
      </dl>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          How your money is spread
        </div>
        <ul className="numeric mt-2 space-y-1 text-sm">
          {plan.howMoneyIsSpread.map((h) => (
            <li key={h.id} className="flex justify-between">
              <span className="text-ink-soft">
                {h.name}
                {h.isAvailableCash ? " (kept available)" : ""}
              </span>
              <span className="font-semibold">{percent(h.sharePercent)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function describeDiff(result: Comparison): string[] {
  const a = result.current;
  const b = result.changed;
  const out: string[] = [];

  const compare = (label: string, x: number, y: number) => {
    if (x !== y) out.push(`${label}: ${percent(x)} → ${percent(y)}`);
  };

  compare("How much you're comfortable losing", a.rules.comfortableLosingPercent, b.rules.comfortableLosingPercent);
  compare("Money kept available", a.rules.moneyKeptAvailablePercent, b.rules.moneyKeptAvailablePercent);
  compare("Maximum in one investment", a.rules.maxInOneInvestmentPercent, b.rules.maxInOneInvestmentPercent);
  compare("Modalis steps in at", a.rules.adjustWhenOffTargetByPercent, b.rules.adjustWhenOffTargetByPercent);

  if (a.riskLevel.level !== b.riskLevel.level) {
    out.push(`Your risk level: ${a.riskLevel.level} → ${b.riskLevel.level}`);
  }

  if (a.goal.target.amount !== b.goal.target.amount) {
    out.push(
      `Your goal: ${usdFromDecimal(a.goal.target.amount, 0)} → ${usdFromDecimal(b.goal.target.amount, 0)}`,
    );
  }
  if (a.goal.targetDate !== b.goal.targetDate) {
    out.push(`When you need it: ${monthsToHuman(a.goal.monthsRemaining)} → ${monthsToHuman(b.goal.monthsRemaining)}`);
  }

  const before = new Map(a.howMoneyIsSpread.map((h) => [h.id, h]));
  for (const h of b.howMoneyIsSpread) {
    const was = before.get(h.id);
    if (!was) out.push(`${h.name} is added at ${percent(h.sharePercent)}`);
    else if (was.sharePercent !== h.sharePercent) {
      out.push(`${h.name}: ${percent(was.sharePercent)} → ${percent(h.sharePercent)}`);
    }
  }
  const after = new Set(b.howMoneyIsSpread.map((h) => h.id));
  for (const [id, h] of before) {
    if (!after.has(id)) out.push(`${h.name} is dropped from the plan`);
  }

  if (out.length === 0) out.push("Nothing about your limits changes.");
  return out;
}
