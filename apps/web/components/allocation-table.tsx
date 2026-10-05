"use client";

/**
 * Where the money is, against where the plan says it should be.
 *
 * Each row carries three facts: what it is now, what the plan wants, and the band it has to stay
 * inside. Anything outside its band is marked by colour AND by a word, so the state survives a
 * colour-blind reader and a greyscale screenshot.
 */
import { RangeBar, Badge } from "./ui";
import { usePortfolio } from "./portfolio-provider";
import { moneyLabel } from "@/lib/format";

export function AllocationTable() {
  const { money, plan } = usePortfolio();
  if (!money || !plan) return null;

  const rangeFor = (id: string) => plan.howMoneyIsSpread.find((h) => h.id === id)?.allowedRange;

  return (
    <ul className="space-y-6">
      {money.holdings.map((h) => {
        const range = rangeFor(h.id) ?? { minPercent: 0, maxPercent: 100 };
        const outside = h.sharePercent > range.maxPercent || h.sharePercent < range.minPercent;
        const drifting =
          Math.abs(h.offTargetByPercent) > plan.rules.adjustWhenOffTargetByPercent;
        const tone = outside ? "breach" : drifting ? "warn" : "ok";

        return (
          <li key={h.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{h.name}</span>
                {h.isAvailableCash ? (
                  <span className="text-xs text-ink-muted">kept available</span>
                ) : null}
                {outside ? <Badge tone="breach">Outside your range</Badge> : null}
                {!outside && drifting ? <Badge tone="warn">Off target</Badge> : null}
              </div>
              <div className="numeric text-right">
                <span className="font-semibold text-ink">{moneyLabel(h.value)}</span>
                <span className="ml-2 text-xs text-ink-muted">
                  {h.sharePercent}% &middot; plan says {h.targetPercent}%
                </span>
              </div>
            </div>

            <div className="mt-2.5">
              <RangeBar
                currentPercent={h.sharePercent}
                targetPercent={h.targetPercent}
                minPercent={range.minPercent}
                maxPercent={range.maxPercent}
                tone={tone}
                label={`${h.name}: ${h.sharePercent}% now, plan says ${h.targetPercent}%, allowed between ${range.minPercent}% and ${range.maxPercent}%`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
