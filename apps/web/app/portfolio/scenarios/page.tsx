"use client";

/**
 * The "What if?" simulator.
 *
 * Asks a question a person actually has — "what if I add more each month?", "what if I need it a
 * year sooner?" — and answers it by rebuilding the mandate under the new assumptions, showing
 * what would change.
 *
 * Deliberately return-free. Every funding figure assumes ZERO investment growth, so the answer is
 * framed as "here is what your own contributions cover", never as a projected return. It writes
 * nothing: changing a real mandate needs the owner's signature.
 */
import { useEffect, useMemo, useState } from "react";
import type { InterviewAnswers } from "@modalis/ai";
import { Badge, Button, Card, KeyValue, Notice, SectionTitle } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { DEFAULT_ANSWERS, loadAnswers } from "@/lib/interview-store";
import { monthsToHuman, pct, pctRound, usd } from "@/lib/format";

type Side = {
  draft: {
    params: Record<string, string | number | boolean>;
    allocations: { symbol: string; targetBps: number; isLiquid: boolean }[];
    profile: { riskScore: number };
  };
  funding: {
    plannedTotalE18: string;
    targetValueE18: string;
    requiredMonthlyE18: string;
    gapMonthlyE18: string;
    coverageBps: number;
  };
};

type Result = { base: Side; changed: Side; disclaimer: string };

const PRESETS: { id: string; label: string; apply: (a: InterviewAnswers) => Partial<InterviewAnswers> }[] = [
  { id: "more", label: "Add $100 more each month", apply: (a) => ({ contributionAmount: a.contributionAmount + 100 }) },
  { id: "sooner", label: "Need it a year sooner", apply: (a) => ({ horizonMonths: Math.max(6, a.horizonMonths - 12) }) },
  { id: "later", label: "Give it a year longer", apply: (a) => ({ horizonMonths: a.horizonMonths + 12 }) },
  { id: "safer", label: "Cut my drawdown limit to 10%", apply: () => ({ maxTolerableDrawdownPct: 10 }) },
  { id: "bigger", label: "Raise my goal by 50%", apply: (a) => ({ targetValue: Math.round(a.targetValue * 1.5) }) },
];

export default function ScenariosPage() {
  return (
    <PortfolioGate>
      <Scenarios />
    </PortfolioGate>
  );
}

function Scenarios() {
  const { portfolio } = usePortfolio();

  // Start from the stored interview answers when available, otherwise reconstruct a base from the
  // live mandate so the page works for a returning user.
  const base: InterviewAnswers = useMemo(() => {
    const stored = loadAnswers();
    if (stored) return stored;
    const m = portfolio?.state?.mandate;
    if (!m) return DEFAULT_ANSWERS;
    const months = Math.max(
      1,
      Math.round((m.targetDate - Math.floor(Date.now() / 1000)) / (30.44 * 86_400)),
    );
    return {
      ...DEFAULT_ANSWERS,
      targetValue: Number(BigInt(m.targetValue) / 10n ** 18n),
      horizonMonths: months,
      maxTolerableDrawdownPct: Math.round(m.maxDrawdownBps / 100),
    };
  }, [portfolio?.state?.mandate]);

  const [selected, setSelected] = useState(PRESETS[0].id);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changes = useMemo(() => {
    const preset = PRESETS.find((p) => p.id === selected) ?? PRESETS[0];
    return preset.apply(base);
  }, [base, selected]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    fetch("/api/scenarios/project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base, changes }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) setError(d.error);
        else setResult(d as Result);
      })
      .catch(() => alive && setError("Could not run the scenario."))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [base, changes]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">What if?</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Change one thing about your plan and see what Modalis would do differently. Nothing here
          changes your real mandate &mdash; that needs your signature.
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
            <SideCard title="Your plan today" side={result.base} answers={base} tone="default" />
            <SideCard
              title="With that change"
              side={result.changed}
              answers={{ ...base, ...changes }}
              tone="accent"
            />
          </div>

          <Card className="bg-surface-sunken">
            <SectionTitle>What actually changes</SectionTitle>
            <ul className="space-y-2 text-sm text-ink-soft">
              {describeDiff(result).map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-ink-muted">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Notice tone="default" title="How to read these numbers">
            {result.disclaimer}
          </Notice>
        </>
      ) : null}
    </div>
  );
}

function SideCard({
  title,
  side,
  answers,
  tone,
}: {
  title: string;
  side: Side;
  answers: InterviewAnswers;
  tone: "default" | "accent";
}) {
  const p = side.draft.params;
  const coverage = side.funding.coverageBps;

  return (
    <Card className={tone === "accent" ? "border-accent/40" : ""}>
      <div className="flex items-center justify-between">
        <SectionTitle>{title}</SectionTitle>
        <Badge tone={coverage >= 10_000 ? "ok" : coverage >= 7_000 ? "warn" : "breach"}>
          {pct(Math.min(coverage, 99_999), 0)} funded
        </Badge>
      </div>

      <dl>
        <KeyValue label="Goal">{usd(BigInt(p.targetValue as string), { decimals: 0 })}</KeyValue>
        <KeyValue label="Horizon">{monthsToHuman(answers.horizonMonths)}</KeyValue>
        <KeyValue label="Contribution">
          ${answers.contributionAmount.toLocaleString("en-US")} / {answers.contributionCadence.replace("ly", "")}
        </KeyValue>
        <KeyValue label="Risk score">{side.draft.profile.riskScore}/100</KeyValue>
        <KeyValue label="Maximum drawdown">{pctRound(Number(p.maxDrawdownBps))}</KeyValue>
        <KeyValue label="Liquidity reserve">{pctRound(Number(p.minLiquidityBps))}</KeyValue>
        <KeyValue label="Maximum single asset">{pctRound(Number(p.maxSingleAssetBps))}</KeyValue>
        <KeyValue label="Needed per month, zero growth">
          {usd(BigInt(side.funding.requiredMonthlyE18), { decimals: 0 })}
        </KeyValue>
      </dl>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Allocation
        </div>
        <ul className="numeric mt-2 space-y-1 text-sm">
          {side.draft.allocations.map((a) => (
            <li key={a.symbol} className="flex justify-between">
              <span className="text-ink-soft">
                {a.symbol}
                {a.isLiquid ? " (cash)" : ""}
              </span>
              <span className="font-semibold">{pctRound(a.targetBps)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function describeDiff(r: Result): string[] {
  const a = r.base.draft.params;
  const b = r.changed.draft.params;
  const out: string[] = [];

  const num = (v: string | number | boolean) => Number(v);
  const compare = (label: string, x: number, y: number, fmt: (n: number) => string) => {
    if (x !== y) out.push(`${label}: ${fmt(x)} → ${fmt(y)}`);
  };

  compare("Maximum drawdown", num(a.maxDrawdownBps), num(b.maxDrawdownBps), pctRound);
  compare("Liquidity reserve", num(a.minLiquidityBps), num(b.minLiquidityBps), pctRound);
  compare("Maximum single asset", num(a.maxSingleAssetBps), num(b.maxSingleAssetBps), pctRound);
  compare("Rebalance threshold", num(a.rebalanceThresholdBps), num(b.rebalanceThresholdBps), pctRound);

  if (r.base.draft.profile.riskScore !== r.changed.draft.profile.riskScore) {
    out.push(
      `Risk score: ${r.base.draft.profile.riskScore}/100 → ${r.changed.draft.profile.riskScore}/100`,
    );
  }

  const bySymbol = new Map(r.base.draft.allocations.map((x) => [x.symbol, x.targetBps]));
  for (const alloc of r.changed.draft.allocations) {
    const before = bySymbol.get(alloc.symbol);
    if (before === undefined) out.push(`${alloc.symbol} is added at ${pctRound(alloc.targetBps)}`);
    else if (before !== alloc.targetBps) {
      out.push(`${alloc.symbol}: ${pctRound(before)} → ${pctRound(alloc.targetBps)}`);
    }
  }
  const changedSymbols = new Set(r.changed.draft.allocations.map((x) => x.symbol));
  for (const [symbol] of bySymbol) {
    if (!changedSymbols.has(symbol)) out.push(`${symbol} is dropped from the plan`);
  }

  const covA = r.base.funding.coverageBps;
  const covB = r.changed.funding.coverageBps;
  if (covA !== covB) {
    out.push(
      `Share of the goal your own contributions cover: ${pct(covA, 0)} → ${pct(covB, 0)} (no growth assumed)`,
    );
  }

  if (out.length === 0) out.push("Nothing about your policy changes.");
  return out;
}
