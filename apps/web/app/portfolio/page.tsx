"use client";

/**
 * The main dashboard.
 *
 * Reading order is deliberate: the goal first, then where the portfolio stands against it, then
 * health, then the holdings, then what Modalis last did and why. The user should understand their
 * portfolio without knowing what an AMM or a smart contract is.
 */
import { Badge, Button, Card, Notice, SectionTitle, Stat } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { AllocationTable } from "@/components/allocation-table";
import { GoalProgress } from "@/components/goal-progress";
import { PendingAction } from "@/components/pending-action";
import { DemoControls } from "@/components/demo-controls";
import { riskLabel, riskTone } from "@/lib/api-types";
import { pct, pctRound, usd } from "@/lib/format";

export default function PortfolioPage() {
  return (
    <PortfolioGate>
      <Dashboard />
    </PortfolioGate>
  );
}

function Dashboard() {
  const { portfolio, risk, status, refresh } = usePortfolio();
  const state = portfolio?.state;
  if (!state) return null;

  const total = BigInt(state.totalValueE18);
  const target = BigInt(state.mandate.targetValue);
  const r = portfolio?.risk;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-muted">Your portfolio</p>
          <Stat label="" value={usd(total)} size="xl" />
          <p className="mt-2 text-sm text-ink-soft">
            of {usd(target, { decimals: 0 })} · mandate v{state.mandate.version} · read at block{" "}
            <span className="numeric">{state.blockNumber}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={riskTone(r?.status)}>{riskLabel(r?.status)}</Badge>
          <Button variant="secondary" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      {portfolio?.agreesWithExecutor === false ? (
        <Notice tone="warn" title="Valuation mismatch">
          This view and the executor&rsquo;s own valuation of the portfolio disagree. The
          executor&rsquo;s numbers are what the mandate is checked against, so treat the figures
          here as indicative until this clears.
        </Notice>
      ) : null}

      {total === 0n ? (
        <Notice tone="accent" title="Your mandate is live, but the portfolio is empty">
          Deposit into the vault to deploy capital against your plan. Until then there is nothing to
          drift and nothing to rebalance.
        </Notice>
      ) : null}

      {/* -------------------------------------------------------- key figures */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Stat
            label="Goal progress"
            value={target === 0n ? "—" : pct(Number((total * 10_000n) / target), 1)}
            sub={`${usd(total, { compact: true })} of ${usd(target, { compact: true })}`}
          />
        </Card>
        <Card>
          <Stat
            label="Largest holding"
            value={r ? pct(r.largestPositionBps) : "—"}
            sub={`limit ${pctRound(state.mandate.maxSingleAssetBps)}`}
            tone={r && r.largestPositionBps > state.mandate.maxSingleAssetBps ? "breach" : "default"}
          />
        </Card>
        <Card>
          <Stat
            label="Cash reserve"
            value={pct(state.liquidityBps)}
            sub={`minimum ${pctRound(state.mandate.minLiquidityBps)}`}
            tone={state.liquidityBps < state.mandate.minLiquidityBps ? "breach" : "default"}
          />
        </Card>
        <Card>
          <Stat
            label="Largest drift"
            value={r ? pct(r.maxDriftBps) : "—"}
            sub={`acts above ${pctRound(state.mandate.rebalanceThresholdBps)}`}
            tone={r && r.maxDriftBps > state.mandate.rebalanceThresholdBps ? "warn" : "default"}
          />
        </Card>
      </div>

      {/* --------------------------------------------- what Modalis will do */}
      <PendingAction />

      {/* ----------------------------------------------------- goal + holdings */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <SectionTitle hint="Your own contributions, with no investment growth assumed.">
            Toward your goal
          </SectionTitle>
          <GoalProgress />
        </Card>

        <Card>
          <SectionTitle hint="Each holding against the target and range you approved.">
            Current allocation
          </SectionTitle>
          <AllocationTable />
        </Card>
      </div>

      {status?.executionVenue?.isDemoVenue ? (
        <Notice tone="warn" title="Trades settle through the demo adapter">
          Kuru is not configured on this deployment. Rebalances fill at the oracle price from
          pre-funded inventory — a test fixture, not a venue. Transactions are still real.
        </Notice>
      ) : null}

      {status?.demoMode ? <DemoControls /> : null}
    </div>
  );
}
