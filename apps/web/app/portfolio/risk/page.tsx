"use client";

/**
 * My plan: the rules I set, and whether my money is inside them.
 *
 * "Risk" here is not a score Modalis invented. It is the distance between the money and limits
 * the person chose themselves.
 */
import { Badge, Card, KeyValue, Notice, SectionTitle } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { AllocationTable } from "@/components/allocation-table";
import { planHealthLabel, planHealthTone } from "@/lib/api-types";

export default function PlanPage() {
  return (
    <PortfolioGate>
      <PlanView />
    </PortfolioGate>
  );
}

function PlanView() {
  const { plan, planStatus, adjustment, money } = usePortfolio();
  if (!plan || !planStatus) return null;

  const checks = [
    {
      label: "Biggest single investment",
      value: `${planStatus.largestHoldingPercent}%`,
      limit: `at most ${plan.rules.maxInOneInvestmentPercent}%`,
      ok: planStatus.largestHoldingPercent <= plan.rules.maxInOneInvestmentPercent,
    },
    {
      label: "Money kept available",
      value: `${planStatus.availableMoneyPercent}%`,
      limit: `at least ${plan.rules.moneyKeptAvailablePercent}%`,
      ok: planStatus.availableMoneyPercent >= plan.rules.moneyKeptAvailablePercent,
    },
    {
      label: "Furthest off target",
      value: `${planStatus.furthestOffTargetPercent}%`,
      limit: `Modalis steps in past ${plan.rules.adjustWhenOffTargetByPercent}%`,
      ok: planStatus.furthestOffTargetPercent <= plan.rules.adjustWhenOffTargetByPercent,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Your plan</h1>
          <p className="mt-2 max-w-2xl text-ink-soft">{planStatus.summary}</p>
        </div>
        <Badge tone={planHealthTone(planStatus.health)}>{planHealthLabel(planStatus.health)}</Badge>
      </div>

      {adjustment && adjustment.reasons.length > 0 ? (
        <Notice tone="breach" title="Your money has moved outside a rule you set">
          <ul className="mt-1 space-y-1">
            {adjustment.reasons.map((r, i) => (
              <li key={`${r.code}-${i}`}>{r.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Card>
        <SectionTitle hint="Each rule, and where your money sits against it right now.">
          Your rules
        </SectionTitle>
        <ul className="divide-y divide-line">
          {checks.map((c) => (
            <li key={c.label} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium text-ink">{c.label}</div>
                <div className="text-xs text-ink-muted">{c.limit}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="numeric font-semibold text-ink">{c.value}</span>
                <Badge tone={c.ok ? "ok" : "breach"}>{c.ok ? "Fine" : "Outside"}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle hint={`Version ${plan.version}. Only you can change this.`}>
            What you approved
          </SectionTitle>
          <dl>
            <KeyValue label="Saving for">{plan.goal.name}</KeyValue>
            <KeyValue label="Goal">${plan.goal.target.amount}</KeyValue>
            <KeyValue label="Risk level">{plan.riskLevel.level}</KeyValue>
            <KeyValue label="Most in one investment">{plan.rules.maxInOneInvestmentPercent}%</KeyValue>
            <KeyValue label="Money kept available">{plan.rules.moneyKeptAvailablePercent}%</KeyValue>
            <KeyValue label="Comfortable losing">{plan.rules.comfortableLosingPercent}%</KeyValue>
            <KeyValue label="Modalis steps in past">{plan.rules.adjustWhenOffTargetByPercent}%</KeyValue>
            <KeyValue label="Status">{plan.status === "active" ? "Active" : "Paused"}</KeyValue>
          </dl>
        </Card>

        <Card>
          <SectionTitle hint="Who can do what. None of this is a policy — it's enforced.">
            What Modalis can and can't do
          </SectionTitle>
          <dl>
            <KeyValue label="Take your money out">Only you</KeyValue>
            <KeyValue label="Change these rules">Only you</KeyValue>
            <KeyValue label="Suggest adjustments">
              {plan.adjustmentsEnabled ? "Modalis may" : "Not allowed"}
            </KeyValue>
            <KeyValue label="Act outside these rules">Nobody</KeyValue>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Modalis can suggest one thing: moving money between your investments. Every suggestion
            is checked against the rules above before anything happens, and a suggestion that
            breaks one is refused outright &mdash; not by Modalis, but by the rules themselves.
          </p>
        </Card>
      </div>

      <Card>
        <SectionTitle>How your money is spread</SectionTitle>
        {money ? <AllocationTable /> : null}
      </Card>
    </div>
  );
}
