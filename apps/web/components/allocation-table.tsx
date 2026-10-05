"use client";

/**
 * How the person's money is spread, against where their plan says it should be.
 *
 * Anything outside its allowed range is marked by colour AND a word, so the state survives
 * greyscale and colour-blind readers.
 */
import { RangeBar, Badge } from "./ui";
import { usePortfolio } from "./portfolio-provider";

export function AllocationTable() {
  const { money, plan } = usePortfolio();
  if (!money || !plan) return null;

  const rangeFor = (id: string) => plan.howMoneyIsSpread.find((h) => h.id === id)?.allowedRange;

  return (
    <ul className="space-y-5">
      {money.holdings.map((h) => {
        const range = rangeFor(h.id) ?? { minPercent: 0, maxPercent: 100 };
        const outside = h.sharePercent > range.maxPercent || h.sharePercent < range.minPercent;
        const drifting = Math.abs(h.offTargetByPercent) > plan.rules.adjustWhenOffTargetByPercent;
        const tone = outside ? "breach" : drifting ? "warn" : "ok";

        return (
          <li key={h.id}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{h.name}</span>
                {h.isAvailableCash ? (
                  <span className="text-xs text-ink-muted">kept available</span>
                ) : null}
                {outside ? <Badge tone="breach">Outside your range</Badge> : null}
              </div>
              <div className="numeric text-right">
                <span className="font-semibold text-ink">{h.sharePercent}%</span>
                <span className="ml-2 text-xs text-ink-muted">
                  plan says {h.targetPercent}% ({h.offTargetByPercent > 0 ? "+" : ""}
                  {h.offTargetByPercent}%)
                </span>
              </div>
            </div>

            <div className="mt-2">
              <RangeBar
                currentBps={Math.round(h.sharePercent * 100)}
                targetBps={Math.round(h.targetPercent * 100)}
                minBps={Math.round(range.minPercent * 100)}
                maxBps={Math.round(range.maxPercent * 100)}
                tone={tone}
              />
            </div>

            <div className="numeric mt-1.5 flex justify-between text-xs text-ink-muted">
              <span>
                {h.units} {h.name} · ${h.value.amount}
              </span>
              <span>
                can range {range.minPercent}%–{range.maxPercent}%
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
