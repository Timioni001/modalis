"use client";

/**
 * The overview — the screen somebody opens the app to see.
 *
 * It answers three questions in order of how often they are asked: how much do I have, am I going
 * to get there, and is there anything I need to do. Everything else is a tap away.
 *
 * Deliberately not a dashboard. No widget grid, no sparkline, no "portfolio performance" chart —
 * this product does not promise performance, so charting it would be inventing a story. One
 * number, one sentence, one action.
 */
import Link from "next/link";
import { Badge, Button, Card, Loading, Notice, ProgressBar, SectionTitle } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { PendingAction } from "@/components/pending-action";
import { DemoControls } from "@/components/demo-controls";
import { moneyLabel } from "@/lib/format";
import type { Tone } from "@/components/ui";

export default function OverviewPage() {
  return (
    <PortfolioGate>
      <Overview />
    </PortfolioGate>
  );
}

const HEALTH_TONE: Record<string, Tone> = {
  on_track: "ok",
  needs_attention: "warn",
  off_track: "breach",
  not_started: "default",
};

function Overview() {
  const { goal, money, plan, loading } = usePortfolio();

  if (!money || !plan) return <Loading label="Loading your money" />;

  const empty = money.isEmpty;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------- how much do I have */}
      <header className="rise-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
            {goal?.goal.name ?? "Your money"}
          </h1>
          {goal ? (
            <Badge tone={HEALTH_TONE[goal.health] ?? "default"} dot>
              {goal.healthLabel}
            </Badge>
          ) : null}
        </div>

        <div className="numeric mt-3 text-5xl font-semibold tracking-[-0.03em] text-ink sm:text-6xl">
          {moneyLabel(money.total)}
        </div>

        {goal ? (
          <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">{goal.summary}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button href="/app/add-money">{empty ? "Add your first money" : "Add money"}</Button>
          <Button href="/app/money" variant="secondary">
            See where it is
          </Button>
        </div>
      </header>

      {/* ---------------------------------------------- is there anything to do */}
      <PendingAction />

      {/* ------------------------------------------------- am I going to get there */}
      {goal && !empty ? (
        <Card>
          <SectionTitle
            action={
              <Link
                href="/app/scenarios"
                className="text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
              >
                What if?
              </Link>
            }
          >
            Progress
          </SectionTitle>

          <div className="flex items-baseline justify-between gap-4">
            <span className="numeric text-3xl font-semibold text-ink">
              {goal.projection.percentComplete}%
            </span>
            <span className="numeric text-sm text-ink-muted">
              {moneyLabel(goal.saved)} of {moneyLabel(goal.goal.target, 0)}
            </span>
          </div>

          <div className="mt-4">
            <ProgressBar
              percent={goal.projection.percentComplete}
              tone={HEALTH_TONE[goal.health] === "breach" ? "warn" : "accent"}
              label={`${goal.projection.percentComplete}% of the way to your goal`}
            />
          </div>

          <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-3">
            <Figure
              label="Time left"
              value={
                goal.goal.monthsRemaining >= 24
                  ? `${Math.round(goal.goal.monthsRemaining / 12)} years`
                  : `${goal.goal.monthsRemaining} months`
              }
            />
            <Figure label="Still to find" value={moneyLabel(goal.projection.shortfall, 0)} />
            <Figure
              label="Needed each month"
              value={moneyLabel(goal.projection.requiredMonthly, 0)}
              hint="assuming no growth"
            />
          </dl>

          {goal.contributionUnknown ? (
            <p className="mt-5 text-xs leading-relaxed text-ink-muted">
              Modalis doesn&rsquo;t know what you add regularly, so it can&rsquo;t say whether
              you&rsquo;re on pace &mdash; only what the goal needs.
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* ----------------------------------------------------- the first step */}
      {empty ? (
        <Notice
          tone="accent"
          title="Your plan is ready and waiting"
          action={<Button href="/app/add-money">Add money</Button>}
        >
          Nothing is invested yet. Add money and Modalis will spread it the way your plan says, so
          it starts on target rather than needing an adjustment straight away.
        </Notice>
      ) : null}

      <DemoControls />

      {loading ? (
        <p className="text-xs text-ink-muted" role="status">
          Refreshing&hellip;
        </p>
      ) : null}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="numeric mt-1 text-xl font-semibold text-ink">{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-ink-muted">{hint}</dd> : null}
    </div>
  );
}
