"use client";

/**
 * Current allocation against target and permitted range.
 *
 * A position outside its range is marked by colour AND a word, so the state survives greyscale
 * and colour-blind readers.
 */
import { RangeBar, Badge } from "./ui";
import { usePortfolio } from "./portfolio-provider";
import { pct, signedPct, tokenAmount, usd } from "@/lib/format";

export function AllocationTable() {
  const { portfolio } = usePortfolio();
  const state = portfolio?.state;
  if (!state) return null;

  const violationsByToken = new Map<string, string>();
  for (const v of portfolio?.risk?.violations ?? []) {
    if (v.token) violationsByToken.set(v.token.toLowerCase(), v.code);
  }

  return (
    <ul className="space-y-5">
      {state.positions.map((p) => {
        const breach = violationsByToken.get(p.token.toLowerCase());
        const tone = breach ? "breach" : Math.abs(p.driftBps) > state.mandate.rebalanceThresholdBps ? "warn" : "ok";
        return (
          <li key={p.token}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{p.symbol}</span>
                {p.isLiquid ? (
                  <span className="text-xs text-ink-muted">cash reserve</span>
                ) : null}
                {breach ? <Badge tone="breach">Outside range</Badge> : null}
              </div>
              <div className="numeric text-right">
                <span className="font-semibold text-ink">{pct(p.allocationBps)}</span>
                <span className="ml-2 text-xs text-ink-muted">
                  target {pct(p.targetBps, 0)} ({signedPct(p.driftBps)})
                </span>
              </div>
            </div>

            <div className="mt-2">
              <RangeBar
                currentBps={p.allocationBps}
                targetBps={p.targetBps}
                minBps={p.minBps}
                maxBps={p.maxBps}
                tone={tone}
              />
            </div>

            <div className="numeric mt-1.5 flex justify-between text-xs text-ink-muted">
              <span>
                {tokenAmount(BigInt(p.amount), p.decimals)} {p.symbol} · {usd(BigInt(p.valueE18))}
              </span>
              <span>
                range {pct(p.minBps, 0)}–{pct(p.maxBps, 0)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
