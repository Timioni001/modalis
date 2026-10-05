"use client";

/**
 * The main screen: my goal, my money, my progress, anything that needs doing.
 *
 * Reads only domain objects. Nothing here knows what a mandate, a vault or a basis point is.
 */
import { Badge, Button, Card, Notice, SectionTitle, Stat } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { AllocationTable } from "@/components/allocation-table";
import { GoalProgress } from "@/components/goal-progress";
import { PendingAction } from "@/components/pending-action";
import { DemoControls } from "@/components/demo-controls";
import { planHealthLabel, planHealthTone } from "@/lib/api-types";

export default function PortfolioPage() {
  return (
    <PortfolioGate>
      <Dashboard />
    </PortfolioGate>
  );
}

function Dashboard() {
  const { plan, money, progress, planStatus, status, refresh } = usePortfolio();
  if (!plan || !money) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-muted">{plan.goal.name}</p>
          <Stat label="" value={`$${money.total.amount}`} size="xl" />
          <p className="mt-2 text-sm text-ink-soft">
            of ${plan.goal.target.amount} · plan version {plan.version}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={planHealthTone(planStatus?.health)}>{planHealthLabel(planStatus?.health)}</Badge>
          <Button variant="secondary" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      {money.isEmpty ? (
        <Notice tone="accent" title="Your plan is ready — now add some money">
          Nothing is invested yet, so there's nothing to keep on track.
          <span className="mt-3 block">
            <Button href="/portfolio/add-money">Add money</Button>
          </span>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Stat
            label="Progress"
            value={progress ? `${progress.percentComplete}%` : "—"}
            sub={progress ? `$${progress.saved.amount} of $${progress.target.amount}` : undefined}
          />
        </Card>
        <Card>
          <Stat
            label="Biggest investment"
            value={planStatus ? `${planStatus.largestHoldingPercent}%` : "—"}
            sub={`your limit is ${plan.rules.maxInOneInvestmentPercent}%`}
            tone={
              planStatus && planStatus.largestHoldingPercent > plan.rules.maxInOneInvestmentPercent
                ? "breach"
                : "default"
            }
          />
        </Card>
        <Card>
          <Stat
            label="Available to withdraw"
            value={`$${money.available.amount}`}
            sub={`you asked for at least ${plan.rules.moneyKeptAvailablePercent}%`}
            tone={
              planStatus && planStatus.availableMoneyPercent < plan.rules.moneyKeptAvailablePercent
                ? "breach"
                : "default"
            }
          />
        </Card>
        <Card>
          <Stat
            label="Furthest off target"
            value={planStatus ? `${planStatus.furthestOffTargetPercent}%` : "—"}
            sub={`Modalis steps in past ${plan.rules.adjustWhenOffTargetByPercent}%`}
            tone={
              planStatus && planStatus.furthestOffTargetPercent > plan.rules.adjustWhenOffTargetByPercent
                ? "warn"
                : "default"
            }
          />
        </Card>
      </div>

      <PendingAction />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <SectionTitle hint="Assuming your money doesn't grow at all.">Toward your goal</SectionTitle>
          <GoalProgress />
        </Card>
        <Card>
          <SectionTitle hint="Each investment against where your plan says it should be.">
            How your money is spread
          </SectionTitle>
          <AllocationTable />
        </Card>
      </div>

      {status?.trading && !status.trading.live ? (
        <Notice tone="warn" title="Trades run through a test fixture here">
          {status.trading.note}
        </Notice>
      ) : null}

      {status?.demoMode ? <DemoControls /> : null}
    </div>
  );
}
