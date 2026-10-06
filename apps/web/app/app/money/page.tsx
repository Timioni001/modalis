"use client";

/**
 * Where the money actually is.
 *
 * Read live from the chain on every visit. A stale balance in a money product is worse than a
 * spinner: someone acting on a number from five minutes ago is someone making a decision from
 * fiction — so the time it was read is on the screen, not in a tooltip.
 */
import { motion } from "motion/react";
import { Button, Card, Loading, PageHeader, SectionTitle } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { AllocationTable } from "@/components/allocation-table";
import { moneyLabel, percent, whenLabel } from "@/lib/format";

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

  const total = Number(money.total.amount);
  const availableShare = total > 0 ? (Number(money.available.amount) / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      <PageHeader
        title="Your money"
        lede="Read from the network just now, not from a saved copy."
        action={<Button href="/app/add-money">Add money</Button>}
      />

      {/* The headline figure, and the one split that matters: reachable vs at work. */}
      <section className="overflow-hidden rounded-[28px] bg-panel text-panel-ink shadow-[var(--shadow-lift)]">
        <div className="p-6 sm:p-8">
          <div className="text-[13px] font-semibold uppercase tracking-[0.09em] text-panel-soft">
            Total
          </div>
          <div className="numeric mt-4 text-[48px] font-semibold leading-none tracking-[-0.03em] sm:text-[60px]">
            {moneyLabel(money.total)}
          </div>

          <div className="mt-8" aria-hidden>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-panel-line">
              <motion.div
                className="h-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, availableShare)}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Split
              swatch="bg-accent"
              label="Available to withdraw"
              value={moneyLabel(money.available)}
              sub={`${percent(Math.round(availableShare))} · held as cash-like`}
            />
            <Split
              swatch="bg-panel-line"
              label="Invested"
              value={moneyLabel(money.invested)}
              sub="At work in your plan"
            />
          </div>

          <p className="mt-7 text-xs text-panel-soft">Read at {whenLabel(money.asOf)}.</p>
        </div>
      </section>

      <Card>
        <SectionTitle hint="Each one has a target and a range it has to stay inside.">
          How your money is spread
        </SectionTitle>
        <AllocationTable />
      </Card>

      <Card>
        <SectionTitle>Taking money out</SectionTitle>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          You can withdraw everything at any time, and nobody can stop you &mdash; not Modalis, not
          anyone. It works even if your plan is paused, because a pause must never trap your money.
        </p>
        <div className="mt-5">
          <Button href="/app/settings" variant="secondary">
            Go to withdrawal
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

function Split({
  swatch,
  label,
  value,
  sub,
}: {
  swatch: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden className={`h-2 w-2 rounded-full ${swatch}`} />
        <span className="text-[13px] text-panel-soft">{label}</span>
      </div>
      <div className="numeric mt-1.5 text-[24px] font-semibold">{value}</div>
      <div className="mt-0.5 text-[12.5px] text-panel-soft">{sub}</div>
    </div>
  );
}
