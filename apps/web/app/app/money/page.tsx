"use client";

/**
 * Where the money actually is.
 *
 * Read live from the chain on every visit. A stale balance in a money product is worse than a
 * spinner: someone acting on a number from five minutes ago is someone making a decision from
 * fiction.
 */
import { Button, Card, Loading, SectionTitle, Stat } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { AllocationTable } from "@/components/allocation-table";
import { moneyLabel, whenLabel } from "@/lib/format";

export default function MoneyPage() {
  return (
    <PortfolioGate>
      <Money />
    </PortfolioGate>
  );
}

function Money() {
  const { money, plan } = usePortfolio();
  if (!money || !plan) return <Loading label="Loading your money" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl font-semibold text-ink">Your money</h1>
          <p className="mt-2 text-ink-soft">
            Read from the network just now, not from a saved copy.
          </p>
        </div>
        <Button href="/app/add-money">Add money</Button>
      </div>

      <Card>
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat label="Total" value={moneyLabel(money.total)} size="lg" />
          <Stat
            label="Available to withdraw"
            value={moneyLabel(money.available)}
            sub="Held as cash-like"
          />
          <Stat label="Invested" value={moneyLabel(money.invested)} sub="At work in your plan" />
        </div>
        <p className="mt-6 text-xs text-ink-muted">Read at {whenLabel(money.asOf)}.</p>
      </Card>

      <Card>
        <SectionTitle hint="Each one has a target and a range it has to stay inside.">
          How your money is spread
        </SectionTitle>
        <AllocationTable />
      </Card>

      <Card>
        <SectionTitle>Taking money out</SectionTitle>
        <p className="text-sm leading-relaxed text-ink-soft">
          You can withdraw everything at any time, and nobody can stop you &mdash; not Modalis, not
          anyone. It works even if your plan is paused, because a pause must never trap your money.
        </p>
        <div className="mt-5">
          <Button href="/app/settings" variant="secondary">
            Go to withdrawal
          </Button>
        </div>
      </Card>
    </div>
  );
}
