"use client";

/**
 * "What if the market drops?" on the person's real holdings, read live from the chain.
 * See lib/stress.ts for exactly what is assumed.
 */
import { useEffect, useMemo, useState } from "react";
import { formatEther, type Address } from "viem";
import { readPortfolio, type PortfolioState } from "@modalis/chain";
import { Card, Notice, SectionTitle } from "./ui";
import { usePortfolio } from "./portfolio-provider";
import { useWalletConfig } from "./wallet-context";
import { browserClient } from "@/lib/chain-client";
import { stressTest } from "@/lib/stress";

const DROPS = [1_000, 2_000, 3_000, 5_000];
const usd = (e18: bigint) =>
  `$${Number(formatEther(e18)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

export function StressTest() {
  const { address, status } = usePortfolio();
  const { chainId, rpcUrl } = useWalletConfig();
  const [state, setState] = useState<PortfolioState | null>(null);
  const [drop, setDrop] = useState(3_000);

  const contracts = status?.technical?.contracts;
  useEffect(() => {
    if (!address || !contracts?.portfolioMandate) return;
    readPortfolio(
      browserClient(chainId, rpcUrl),
      { chainId, contracts: contracts as Record<string, Address>, tokens: {} },
      address as Address,
    )
      .then(setState)
      .catch(() => setState(null));
  }, [address, contracts, chainId, rpcUrl]);

  const result = useMemo(
    () =>
      state && state.totalValueE18 > 0n
        ? stressTest(state.positions, state.mandate, drop)
        : null,
    [state, drop],
  );

  if (!result || !state) return null;

  return (
    <Card>
      <SectionTitle hint="Your real holdings, read from Monad just now.">
        What if the market drops?
      </SectionTitle>
      <div className="flex flex-wrap gap-2">
        {DROPS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={drop === d}
            onClick={() => setDrop(d)}
            className={`min-h-[42px] rounded-full px-4 text-[14px] font-semibold transition-colors ${
              drop === d ? "bg-panel text-panel-ink" : "bg-sunken text-ink-soft hover:bg-line hover:text-ink"
            }`}
          >
            {pct(d)} drop
          </button>
        ))}
      </div>

      <p className="mt-5 text-[17px] leading-relaxed text-ink" aria-live="polite">
        Your plan would fall from <strong className="numeric">{usd(result.beforeE18)}</strong> to{" "}
        <strong className="numeric">{usd(result.afterE18)}</strong>, a fall of {pct(result.planFallBps)}.{" "}
        {result.pastDrawdownLimit
          ? `That's more than the ${pct(state.mandate.maxDrawdownBps)} you said you could live with.`
          : `That's within the ${pct(state.mandate.maxDrawdownBps)} you said you could live with.`}
      </p>

      <div className="mt-4">
        {result.outsideRange.length || result.belowLiquidityFloor ? (
          <Notice tone="warn" title="Modalis would suggest an adjustment">
            {result.outsideRange.map((p) => (
              <p key={p.symbol}>
                {p.symbol} would be {pct(p.afterBps)} of your plan; its range is {pct(p.minBps)} to {pct(p.maxBps)}.
              </p>
            ))}
            {result.belowLiquidityFloor ? (
              <p>Money kept available would drop below your {pct(state.mandate.minLiquidityBps)} floor.</p>
            ) : null}
            <p className="mt-1">Any adjustment still has to pass your plan&rsquo;s limits in the contract.</p>
          </Notice>
        ) : (
          <Notice tone="ok" title="Everything stays inside its range">
            Your plan would hold its shape; Modalis wouldn&rsquo;t need to change anything.
          </Notice>
        )}
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        Assumes everything except money kept available falls by {pct(drop)} at once, and nothing
        recovers. A blunt test, not a forecast.
      </p>
    </Card>
  );
}
