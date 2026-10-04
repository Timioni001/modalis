"use client";

/**
 * Goal progress.
 *
 * Shows where the portfolio is against the target and how much of the remainder the user's own
 * contributions cover. Deliberately NO projected return: the brief is explicit that projections
 * must not be presented as promises, so the only forward-looking number here is money the user
 * says they will add.
 */
import { usePortfolio } from "./portfolio-provider";
import { pct, targetDateLabel, usd } from "@/lib/format";

export function GoalProgress() {
  const { portfolio } = usePortfolio();
  const state = portfolio?.state;
  if (!state) return null;

  const total = BigInt(state.totalValueE18);
  const target = BigInt(state.mandate.targetValue);
  const progressBps = target === 0n ? 0 : Number((total * 10_000n) / target);
  const remaining = target > total ? target - total : 0n;

  const monthsLeft = Math.max(
    0,
    Math.round((state.mandate.targetDate - Math.floor(Date.now() / 1000)) / (30.44 * 86_400)),
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="numeric text-3xl font-semibold text-ink">{pct(progressBps, 1)}</span>
          <span className="text-sm text-ink-muted">
            {usd(total, { compact: true })} of {usd(target, { compact: true })}
          </span>
        </div>
        <div
          className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={Math.min(100, progressBps / 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Goal progress"
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, progressBps / 100)}%` }}
          />
        </div>
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Target date</dt>
          <dd className="numeric font-semibold">{targetDateLabel(state.mandate.targetDate)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Time remaining</dt>
          <dd className="numeric font-semibold">
            {monthsLeft} month{monthsLeft === 1 ? "" : "s"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Still to fund</dt>
          <dd className="numeric font-semibold">{usd(remaining, { decimals: 0 })}</dd>
        </div>
        {monthsLeft > 0 && remaining > 0n ? (
          <div className="flex justify-between">
            <dt className="text-ink-muted">Needed per month, at zero growth</dt>
            <dd className="numeric font-semibold">
              {usd(remaining / BigInt(monthsLeft), { decimals: 0 })}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="text-xs leading-relaxed text-ink-muted">
        Figures assume no investment growth. Modalis does not promise a return, and nothing here is
        a projection of future performance.
      </p>
    </div>
  );
}
