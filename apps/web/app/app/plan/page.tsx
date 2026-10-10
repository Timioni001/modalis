"use client";

/**
 * The plan: the rules the person approved.
 *
 * The limits lead, because they are the whole of what the person agreed to and the whole of what
 * Modalis may do. They are set as four large figures rather than a settings table — a settings
 * table reads as preferences, and these are not preferences.
 *
 * Under them sits the boundary: what Modalis can and cannot do, where that is enforced, and the
 * control to stop it. Someone who wants to know "what is this thing allowed to do to my money"
 * should never have to go looking.
 */
import { Explain } from "@/components/explain";
import { motion } from "motion/react";
import {
  Badge,
  Button,
  Card,
  KeyValue,
  Loading,
  Notice,
  PageHeader,
  Row,
  Rows,
  SectionTitle,
} from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { ReceiptLink } from "@/components/receipt-link";
import { PauseControl } from "@/components/pause-control";
import { PlanHistory } from "@/components/plan-history";
import { monthYear, percent, usdFromDecimal } from "@/lib/format";

export default function PlanPage() {
  return (
    <PortfolioGate>
      <PlanView />
    </PortfolioGate>
  );
}

const CAN = [
  "Suggest a change when your money drifts off target",
  "Carry out a change you approve, inside your limits",
  "Read your balances and tell you where you stand",
];

const CANNOT = [
  "Send your money to an address you didn't approve",
  "Go past any of the four limits above",
  "Act at all while adjustments are paused",
  "Change your limits — only you can",
];

function PlanView() {
  const { plan, goal, status } = usePortfolio();

  if (!plan) return <Loading label="Loading your plan" />;

  const LIMITS = [
    {
      label: "How much you're comfortable losing",
      value: percent(plan.rules.comfortableLosingPercent),
      body: "Below this, the plan gets more cautious on its own.",
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      <PageHeader
        title="Your plan"
        lede={plan.summary}
        action={
          <Badge
            tone={plan.status === "active" ? "ok" : plan.status === "paused" ? "warn" : "default"}
            dot
          >
            {plan.status === "active" ? "Running" : plan.status === "paused" ? "Paused" : "Draft"}
          </Badge>
        }
      />

      {plan.status === "paused" ? (
        <Notice tone="warn" title="Your plan is paused">
          Modalis won&rsquo;t make any adjustments while it&rsquo;s paused. Your money stays where
          it is, and you can still withdraw it at any time.
        </Notice>
      ) : null}

      {/* ----------------------------------------------------------- the limits */}
      <section>
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
          The limits you set
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {LIMITS.map((limit) => (
            <div
              key={limit.label}
              className="rounded-[24px] bg-surface p-6 shadow-[var(--shadow-card)]"
            >
              <div className="numeric text-[40px] font-semibold leading-none text-ink">
                {limit.value}
              </div>
              <div className="mt-4 font-semibold text-ink">{limit.label}</div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{limit.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 px-1 text-[13.5px] text-ink-muted">
          This is the whole of what Modalis may do. Anything outside these is refused before it can
          happen.
        </p>
      </section>

      {/* ------------------------------------------------------- the boundary */}
      <Card>
        <SectionTitle hint="Enforced by a contract on the network, not by Modalis choosing to behave.">
          What Modalis can and cannot do
        </SectionTitle>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-[12.5px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
              Can
            </div>
            <ul className="mt-3 space-y-2.5">
              {CAN.map((line) => (
                <li key={line} className="flex gap-2.5 text-[14.5px] leading-snug text-ink">
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="mt-0.5 h-4 w-4 flex-none text-ok"
                    fill="none"
                  >
                    <path
                      d="M3 8.5l3.2 3.2L13 5"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[12.5px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
              Cannot
            </div>
            <ul className="mt-3 space-y-2.5">
              {CANNOT.map((line) => (
                <li key={line} className="flex gap-2.5 text-[14.5px] leading-snug text-ink-soft">
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="mt-0.5 h-4 w-4 flex-none text-ink-muted"
                    fill="none"
                  >
                    <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Where it is enforced, and how to stop it. Both on the same shelf. */}
        <div className="mt-7 rounded-2xl bg-sunken p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div>
              <div className="text-[13px] font-medium text-ink-muted">
                Your limits are held at
              </div>
              <div className="mt-1.5">
                {status?.technical?.contracts?.portfolioMandate ? (
                  <ReceiptLink address={status.technical.contracts.portfolioMandate} />
                ) : (
                  <span className="text-[13px] text-ink-muted">
                    Not published on this deployment.
                  </span>
                )}
              </div>
            </div>
            <PauseControl />
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
            Pausing stops Modalis acting immediately. It never stops you withdrawing.
          </p>
        </div>
      </Card>

      {/* ------------------------------------------------------------- the goal */}
      {goal ? (
        <Card>
          <SectionTitle>What it&rsquo;s for</SectionTitle>
          <dl>
            <KeyValue label="Goal">{goal.goal.name}</KeyValue>
            <KeyValue label="Target">{usdFromDecimal(goal.goal.target.amount, 0)}</KeyValue>
            <KeyValue label="By">{monthYear(goal.goal.targetDate)}</KeyValue>
            <KeyValue label="You said you'd add">
              {usdFromDecimal(goal.goal.contribution.amount.amount, 0)} per{" "}
              {goal.goal.contribution.cadence.replace("ly", "")}
            </KeyValue>
          </dl>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- the allocation */}
      <Card>
        <SectionTitle hint="Each one has a target and a range it has to stay inside.">
          How your money is meant to be spread
        </SectionTitle>
        <Rows>
          {plan.howMoneyIsSpread.map((h) => (
            <Row key={h.id} className="flex items-center justify-between gap-4">
              <div>
                <span className="font-medium text-ink">{h.name}</span>
                {h.isAvailableCash ? (
                  <span className="ml-2 text-xs text-ink-muted">
                    kept available
                    <Explain term="available" />
                  </span>
                ) : null}
              </div>
              <div className="text-right">
                <div className="numeric font-semibold text-ink">{percent(h.sharePercent)}</div>
                <div className="numeric text-xs text-ink-muted">
                  {percent(h.allowedRange.minPercent)}&ndash;{percent(h.allowedRange.maxPercent)}
                </div>
              </div>
            </Row>
          ))}
        </Rows>
      </Card>

      <PlanHistory />

      {/* --------------------------------------------------------- changing it */}
      <Card>
        <SectionTitle>Changing your plan</SectionTitle>
        <p className="text-[15px] leading-relaxed text-ink-soft">
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
    </motion.div>
  );
}
