"use client";

/**
 * Progress toward the goal.
 *
 * No projected return anywhere: the only forward-looking figure is money the person themselves
 * adds. Showing a projection as a path to the goal would present a guess as a promise.
 */
import { usePortfolio } from "./portfolio-provider";

export function GoalProgress() {
  const { progress } = usePortfolio();
  if (!progress) return null;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="numeric text-3xl font-semibold text-ink">{progress.percentComplete}%</span>
          <span className="text-sm text-ink-muted">
            ${progress.saved.amount} of ${progress.target.amount}
          </span>
        </div>
        <div
          className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={Math.min(100, progress.percentComplete)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress toward your goal"
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, progress.percentComplete)}%` }}
          />
        </div>
      </div>

      <p className="text-sm text-ink-soft">{progress.summary}</p>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Needed by</dt>
          <dd className="numeric font-semibold">
            {new Date(progress.targetDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Time left</dt>
          <dd className="numeric font-semibold">
            {progress.monthsRemaining} month{progress.monthsRemaining === 1 ? "" : "s"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Still to save</dt>
          <dd className="numeric font-semibold">${progress.remaining.amount}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">To stay on track, per month</dt>
          <dd className="numeric font-semibold">${progress.monthlyToStayOnTrack.amount}</dd>
        </div>
      </dl>

      <p className="text-xs leading-relaxed text-ink-muted">
        These figures assume your money doesn&rsquo;t grow at all. Modalis doesn&rsquo;t promise a
        return, and nothing here predicts how your investments will perform.
      </p>
    </div>
  );
}
