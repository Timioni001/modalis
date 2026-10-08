"use client";

/**
 * "Does anything need my attention?" — answered by the domain's health engine.
 *
 * Each reason shows the two figures it compares, so the person can check the claim rather than
 * take it on trust. The engine is the same one Ask Modalis uses, so the card and the conversation
 * can never disagree.
 */
import Link from "next/link";
import { assessHealth, type HealthState } from "@modalis/domain";
import { usePortfolio } from "./portfolio-provider";

const DOT: Record<HealthState, string> = {
  healthy: "bg-ok",
  watch: "bg-warn",
  action_required: "bg-breach",
  restricted: "bg-ink-muted",
};

export function HealthCard() {
  const { plan, money, goal, planStatus } = usePortfolio();
  if (!plan) return null;

  const health = assessHealth({
    planStatus: plan.status,
    rules: plan.rules,
    moneyEmpty: money ? money.isEmpty : undefined,
    allocation: planStatus
      ? {
          furthestOffTargetPercent: planStatus.furthestOffTargetPercent,
          largestHoldingPercent: planStatus.largestHoldingPercent,
          availableMoneyPercent: planStatus.availableMoneyPercent,
        }
      : undefined,
    goal: goal
      ? {
          health: goal.health,
          shortfall: goal.projection.shortfall,
          requiredMonthly: goal.projection.requiredMonthly,
          monthsRemaining: goal.goal.monthsRemaining,
          percentComplete: goal.projection.percentComplete,
        }
      : undefined,
  });

  return (
    <section className="rounded-[28px] bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[health.state]}`} />
          <h2 className="text-[15px] font-semibold text-ink">{health.label}</h2>
        </div>
        <Link
          href="/app/ask"
          className="-mr-2 inline-flex min-h-[36px] items-center rounded-full px-3 text-[13.5px] font-semibold text-ink-soft hover:bg-sunken hover:text-ink"
        >
          Ask why
        </Link>
      </div>

      {health.reasons.length === 0 ? (
        <p className="mt-2 text-[15px] text-ink-soft">{health.headline}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {health.reasons.map((r) => (
            <li key={r.code} className="rounded-2xl bg-sunken p-4">
              <p className="text-[14.5px] leading-relaxed text-ink">{r.message}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {r.evidence.map((e) => (
                  <span
                    key={e.label}
                    className="numeric inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12.5px] text-ink-soft"
                  >
                    {e.label}
                    <span className="font-semibold text-ink">{e.value}</span>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
