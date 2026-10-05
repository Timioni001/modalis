"use client";

/**
 * The plan: the rules the person approved.
 *
 * The most important thing on this screen is the limits, because they are the whole of what the
 * person agreed to and the whole of what Modalis may do. They are shown as sentences with numbers
 * in them rather than as a settings table, because that is how they were agreed.
 */
import { Badge, Button, Card, KeyValue, Loading, Notice, SectionTitle } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { monthYear, percent } from "@/lib/format";

export default function PlanPage() {
  return (
    <PortfolioGate>
      <PlanView />
    </PortfolioGate>
  );
}

function PlanView() {
  const { plan, goal } = usePortfolio();
  if (!plan) return <Loading label="Loading your plan" />;

  const LIMITS = [
    {
      label: "How much you're comfortable losing",
      value: percent(plan.rules.comfortableLosingPercent),
      body: "The largest drop your plan is built to tolerate before it gets more cautious.",
    },
    {
      label: "Money kept available",
      value: percent(plan.rules.moneyKeptAvailablePercent),
      body: "Stays easy to withdraw, so your plan never traps money you might need.",
    },
    {
      label: "Maximum in one investment",
      value: percent(plan.rules.maxInOneInvestmentPercent),
      body: "No single investment may grow past this share, however well it's doing.",
    },
    {
      label: "When Modalis steps in",
      value: percent(plan.rules.adjustWhenOffTargetByPercent),
      body: "How far off target something can drift before Modalis suggests a change.",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl font-semibold text-ink">Your plan</h1>
          <p className="mt-2 max-w-xl text-ink-soft">{plan.summary}</p>
        </div>
        <Badge tone={plan.status === "active" ? "ok" : plan.status === "paused" ? "warn" : "default"} dot>
          {plan.status === "active" ? "Running" : plan.status === "paused" ? "Paused" : "Draft"}
        </Badge>
      </div>

      {plan.status === "paused" ? (
        <Notice tone="warn" title="Your plan is paused">
          Modalis won&rsquo;t make any adjustments while it&rsquo;s paused. Your money stays where
          it is, and you can still withdraw it at any time.
        </Notice>
      ) : null}

      {/* ------------------------------------------------------------- the goal */}
      {goal ? (
        <Card>
          <SectionTitle>What it&rsquo;s for</SectionTitle>
          <dl>
            <KeyValue label="Goal">{goal.goal.name}</KeyValue>
            <KeyValue label="Target">${goal.goal.target.amount}</KeyValue>
            <KeyValue label="By">{monthYear(goal.goal.targetDate)}</KeyValue>
            <KeyValue label="You said you'd add">
              ${goal.goal.contribution.amount.amount} per{" "}
              {goal.goal.contribution.cadence.replace("ly", "")}
            </KeyValue>
          </dl>
        </Card>
      ) : null}

      {/* ----------------------------------------------------------- the limits */}
      <Card>
        <SectionTitle hint="This is the whole of what Modalis may do. Anything outside these is refused before it can happen.">
          The limits you set
        </SectionTitle>
        <ul className="divide-y divide-line">
          {LIMITS.map((limit) => (
            <li key={limit.label} className="flex items-start justify-between gap-6 py-4 first:pt-0">
              <div>
                <div className="font-medium text-ink">{limit.label}</div>
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">{limit.body}</p>
              </div>
              <div className="numeric flex-none text-2xl font-semibold text-ink">{limit.value}</div>
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------- the allocation */}
      <Card>
        <SectionTitle hint="Each one has a target and a range it has to stay inside.">
          How your money is meant to be spread
        </SectionTitle>
        <ul className="divide-y divide-line">
          {plan.howMoneyIsSpread.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-4 py-3.5 first:pt-0">
              <div>
                <span className="font-medium text-ink">{h.name}</span>
                {h.isAvailableCash ? (
                  <span className="ml-2 text-xs text-ink-muted">kept available</span>
                ) : null}
              </div>
              <div className="text-right">
                <div className="numeric font-semibold text-ink">{percent(h.sharePercent)}</div>
                <div className="numeric text-xs text-ink-muted">
                  {percent(h.allowedRange.minPercent)}&ndash;{percent(h.allowedRange.maxPercent)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------- changing it */}
      <Card>
        <SectionTitle>Changing your plan</SectionTitle>
        <p className="text-sm leading-relaxed text-ink-soft">
          Changing your plan replaces it. Anything Modalis had already worked out against the old
          limits stops being valid at that moment, so nothing out of date can go through
          afterwards.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button href="/onboarding" variant="secondary">
            Change my plan
          </Button>
          <Button href="/app/scenarios" variant="quiet">
            See what a change would do first
          </Button>
        </div>
      </Card>
    </div>
  );
}
