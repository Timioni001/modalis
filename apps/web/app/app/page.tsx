"use client";

/**
 * The overview — the screen somebody opens the app to see.
 *
 * It answers three questions in the order they are asked: am I going to get there, is there
 * anything I need to do, and where is my money. The answer to the first one is the single black
 * panel on the screen, so there is never a moment of hunting for it.
 *
 * Deliberately not a dashboard. No widget grid, no sparkline, no "portfolio performance" chart —
 * this product does not promise performance, so charting it would be inventing a story.
 */
import Link from "next/link";
import { motion } from "motion/react";
import {
  Badge,
  Button,
  Card,
  Corridor,
  Loading,
  Notice,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { PendingAction } from "@/components/pending-action";
import { DemoControls } from "@/components/demo-controls";
import { DemoPriceRecovery } from "@/components/demo-price-recovery";
import { AssetQuantities } from "@/components/asset-quantities";
import { DriftMeter } from "@/components/drift-meter";
import { LocalAmount } from "@/components/local-amount";
import { GoalReached } from "@/components/goal-reached";
import { HealthCard } from "@/components/health-card";
import { moneyLabel, monthYear, percent } from "@/lib/format";
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

  if (!plan) return <Loading label="Loading your plan" />;
  if (!money)
    return (
      <div className="space-y-4">
        <PageHeader
          title={plan.goal.name}
          lede="Your plan is saved. Payments, asset quantities and your saving goals remain accessible."
        />
        <DemoPriceRecovery />
        <AssetQuantities />
        <div className="flex flex-wrap gap-3">
          <Button href="/app/payments">Open payments</Button>
          <Button variant="secondary" href="/app/plan">
            View your saved plan
          </Button>
        </div>
      </div>
    );

  const empty = money.isEmpty;
  const tone = goal ? (HEALTH_TONE[goal.health] ?? "default") : "default";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      {goal ? (
        <h1 className="display px-1 text-[30px] font-semibold text-ink sm:text-[38px]">
          Saving for{" "}
          <span className="accent-serif text-[1.08em]">
            {goal.goal.name.toLowerCase()}
          </span>
        </h1>
      ) : null}

      {/* ============================================== am I going to get there */}
      <section className="overflow-hidden rounded-[28px] bg-panel text-panel-ink shadow-[var(--shadow-lift)]">
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="eyebrow text-panel-soft">Your money</div>
            {goal ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  tone === "ok"
                    ? "bg-accent text-accent-ink"
                    : tone === "warn"
                      ? "bg-warn text-panel"
                      : tone === "breach"
                        ? "bg-breach text-panel-ink"
                        : "bg-panel-line text-panel-ink"
                }`}
              >
                {goal.healthLabel}
              </span>
            ) : null}
          </div>

          <div className="numeric mt-5 text-[48px] font-semibold leading-none tracking-[-0.03em] sm:text-[64px]">
            {moneyLabel(money.total)}
          </div>
          <LocalAmount
            usd={money.total.amount}
            className="mt-2 block text-panel-soft"
          />

          {goal ? (
            <>
              <div className="mt-7">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-panel-line">
                  <motion.div
                    className={`h-full rounded-full ${
                      tone === "breach"
                        ? "bg-breach"
                        : tone === "warn"
                          ? "bg-warn"
                          : "bg-accent"
                    }`}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.min(100, goal.projection.percentComplete)}%`,
                    }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13.5px]">
                  <span className="numeric font-semibold">
                    {percent(goal.projection.percentComplete)} of{" "}
                    {moneyLabel(goal.goal.target, 0)}
                    <span className="font-normal text-panel-soft">
                      {" "}
                      toward {goal.goal.name.toLowerCase()}
                    </span>
                  </span>
                  <span className="text-panel-soft">
                    needed by {monthYear(goal.goal.targetDate)}
                  </span>
                </div>
              </div>

              <p className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-panel-soft">
                {goal.summary}
              </p>
            </>
          ) : null}

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              href="/app/add-money"
              className="inline-flex min-h-[48px] items-center rounded-full bg-accent px-6 text-[14.5px] font-semibold text-accent-ink transition-[filter] hover:brightness-[1.04] active:scale-[0.985]"
            >
              {empty ? "Add your first money" : "Add money"}
            </Link>
            <Link
              href="/app/money"
              className="inline-flex min-h-[48px] items-center rounded-full bg-panel-line px-6 text-[14.5px] font-semibold text-panel-ink transition-colors hover:brightness-125"
            >
              See where it is
            </Link>
          </div>
        </div>

        {/* The three figures that follow from the headline, as tiles inside the panel. */}
        {goal && !empty ? (
          <dl className="grid grid-cols-3 gap-2.5 px-4 pb-4 sm:gap-3 sm:px-6 sm:pb-6">
            <Tile
              label="Time left"
              value={
                goal.goal.monthsRemaining >= 24
                  ? `${Math.round(goal.goal.monthsRemaining / 12)} yrs`
                  : `${goal.goal.monthsRemaining} mo`
              }
            />
            <Tile
              label="Gap at goal date"
              value={moneyLabel(goal.projection.shortfall, 0)}
            />
            <Tile
              label="Per month"
              value={moneyLabel(goal.projection.requiredMonthly, 0)}
            />
          </dl>
        ) : null}
        {goal ? (
          <p className="px-6 pb-5 text-xs text-panel-soft sm:px-8">
            Based on your planned contributions, assuming no investment growth.
          </p>
        ) : null}
      </section>

      {/* ============================================= is there anything to do */}
      <HealthCard />
      <PendingAction />

      {empty ? (
        <Notice
          tone="accent"
          title="Your plan is ready and waiting"
          action={<Button href="/app/add-money">Add money</Button>}
        >
          Nothing is invested yet. Add money and Modalis will spread it the way
          your plan says, so it starts on target rather than needing an
          adjustment straight away.
        </Notice>
      ) : null}

      {/* ===================================================== where is my money */}
      {!empty ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionTitle
              action={
                <Link
                  href="/app/money"
                  className="-mr-2 inline-flex min-h-[36px] items-center rounded-full px-2 text-[13.5px] font-semibold text-ink-soft hover:bg-sunken hover:text-ink"
                >
                  All of it
                </Link>
              }
            >
              Where it is
            </SectionTitle>
            <ul className="space-y-4">
              {money.holdings.slice(0, 4).map((h) => {
                const band = plan.howMoneyIsSpread.find(
                  (p) => p.id === h.id,
                )?.allowedRange;
                const outside =
                  band !== undefined &&
                  (h.sharePercent > band.maxPercent ||
                    h.sharePercent < band.minPercent);
                return (
                  <li key={h.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[14.5px] font-medium text-ink">
                        {h.name}
                      </span>
                      <span className="numeric flex-none text-[14.5px] font-semibold text-ink">
                        {moneyLabel(h.value, 0)}
                        <span className="ml-2 font-normal text-ink-muted">
                          {percent(h.sharePercent)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2">
                      <Corridor
                        percent={h.sharePercent}
                        target={h.targetPercent}
                        bandFrom={band?.minPercent ?? 0}
                        bandTo={band?.maxPercent ?? 100}
                        tone={outside ? "breach" : "default"}
                        label={`${h.name}: ${h.sharePercent}% now, plan says ${h.targetPercent}%`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <SectionTitle
              action={
                <Link
                  href="/app/plan"
                  className="-mr-2 inline-flex min-h-[36px] items-center rounded-full px-2 text-[13.5px] font-semibold text-ink-soft hover:bg-sunken hover:text-ink"
                >
                  Change
                </Link>
              }
            >
              Your limits
            </SectionTitle>
            <dl className="space-y-px overflow-hidden rounded-2xl bg-line">
              <Limit
                label="Most you'd lose"
                value={percent(plan.rules.comfortableLosingPercent)}
              />
              <Limit
                label="Kept available"
                value={percent(plan.rules.moneyKeptAvailablePercent)}
              />
              <Limit
                label="Max in one thing"
                value={percent(plan.rules.maxInOneInvestmentPercent)}
              />
              <Limit
                label="Step in when off by"
                value={percent(plan.rules.adjustWhenOffTargetByPercent)}
              />
            </dl>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge tone={plan.adjustmentsEnabled ? "ok" : "default"} dot>
                {plan.adjustmentsEnabled
                  ? "Adjustments on"
                  : "Adjustments paused"}
              </Badge>
              <Link
                href="/app/settings"
                className="inline-flex min-h-[36px] items-center rounded-full px-2 text-[13px] font-semibold text-ink-soft hover:bg-sunken hover:text-ink"
              >
                {plan.adjustmentsEnabled ? "Pause" : "Resume"}
              </Link>
            </div>
          </Card>
        </div>
      ) : null}

      {/* What-if, offered rather than buried in a menu. */}
      {goal && !empty ? (
        <Link
          href="/app/scenarios"
          className="flex items-center justify-between gap-4 rounded-[28px] bg-surface p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
        >
          <div>
            <div className="text-[16px] font-semibold text-ink">
              What if something changed?
            </div>
            <p className="mt-1 text-[14px] text-ink-muted">
              Add more, retire earlier, markets fall 20%. Nothing is saved.
            </p>
          </div>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="h-5 w-5 flex-none text-ink-muted"
            fill="none"
          >
            <path
              d="M7.5 4.5L13 10l-5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      ) : null}

      <GoalReached />

      <DriftMeter />

      <DemoControls />

      {loading ? (
        <p className="text-xs text-ink-muted" role="status">
          Refreshing&hellip;
        </p>
      ) : null}
    </motion.div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-panel-line/70 px-3 py-4 sm:px-5">
      <dd className="numeric text-[20px] font-semibold leading-none text-panel-ink sm:text-[26px]">
        {value}
      </dd>
      <dt className="mt-2 text-[12px] text-panel-soft">{label}</dt>
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 bg-surface px-4 py-3.5">
      <dt className="text-[14px] text-ink-soft">{label}</dt>
      <dd className="numeric text-[16px] font-semibold text-ink">{value}</dd>
    </div>
  );
}
