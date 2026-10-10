"use client";

/**
 * Live drift meter: how far each holding sits from its target, re-read from the chain on every
 * new block.
 *
 * Practical only because Monad produces a block about every 0.4s and reads are cheap. Each bar
 * shows the plan's allowed range, the target, and where the holding is right now; the block number
 * ticking up is the proof that it is live, not animated.
 */
import { useEffect, useRef, useState } from "react";
import { readPortfolio, type PortfolioState } from "@modalis/chain";
import type { Address } from "viem";
import { Badge, Card, SectionTitle } from "./ui";
import { usePortfolio } from "./portfolio-provider";
import { useWalletConfig } from "./wallet-context";
import { browserClient } from "@/lib/chain-client";

const POLL_MS = 600;

export function DriftMeter() {
  const { address, status, needsPlan } = usePortfolio();
  const { chainId, rpcUrl } = useWalletConfig();
  const [state, setState] = useState<PortfolioState | null>(null);
  const [failed, setFailed] = useState(false);
  const lastBlock = useRef<bigint>(0n);

  const contracts = status?.technical?.contracts;
  const tokens = status?.technical?.tokens;

  useEffect(() => {
    if (!address || !contracts?.portfolioMandate || needsPlan) return;
    const client = browserClient(chainId, rpcUrl);
    const deployment = {
      chainId,
      contracts: contracts as Record<string, Address>,
      tokens: (tokens ?? {}) as Record<string, Address>,
    };
    let stopped = false;
    let busy = false;

    const tick = async () => {
      if (stopped || busy || document.hidden) return;
      busy = true;
      try {
        const block = await client.getBlockNumber({ cacheTime: 0 });
        if (block !== lastBlock.current) {
          lastBlock.current = block;
          const next = await readPortfolio(client, deployment, address as Address);
          if (!stopped) {
            setState(next);
            setFailed(false);
          }
        }
      } catch {
        if (!stopped) setFailed(true);
      } finally {
        busy = false;
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [address, contracts, tokens, chainId, rpcUrl, needsPlan]);

  if (!state || state.positions.length === 0 || state.totalValueE18 === 0n) return null;

  const outside = state.positions.filter((p) => p.allocationBps < p.minBps || p.allocationBps > p.maxBps);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle hint="Re-read from Monad on every new block, about every half second.">
          Live drift
        </SectionTitle>
        <div className="flex items-center gap-2">
          <Badge tone={outside.length ? "warn" : "ok"} dot>
            {outside.length ? `${outside.length} outside its range` : "All within range"}
          </Badge>
          <span className="numeric text-xs text-ink-muted" aria-live="off">
            block {state.blockNumber.toLocaleString("en-US")}
            {failed ? " · reconnecting" : ""}
          </span>
        </div>
      </div>

      <ul className="mt-2 space-y-4">
        {state.positions.map((p) => {
          // Scale each bar to 0..max(range, current) so the marker is always on screen.
          const scale = Math.max(p.maxBps, p.allocationBps, 1) * 1.15;
          const pos = (bps: number) => `${Math.min(100, (bps / scale) * 100)}%`;
          const off = p.allocationBps < p.minBps || p.allocationBps > p.maxBps;
          const drift = p.driftBps / 100;
          return (
            <li key={p.token}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-ink">{p.symbol}</span>
                <span className={`numeric text-xs ${off ? "text-warn" : "text-ink-muted"}`}>
                  {(p.allocationBps / 100).toFixed(2)}% now · target {(p.targetBps / 100).toFixed(0)}% ·{" "}
                  {drift >= 0 ? "+" : ""}
                  {drift.toFixed(2)} pts
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 rounded-full bg-sunken">
                <div
                  className="absolute inset-y-0 rounded-full bg-ok-soft"
                  style={{ left: pos(p.minBps), width: `calc(${pos(p.maxBps)} - ${pos(p.minBps)})` }}
                  aria-hidden
                />
                <div className="absolute inset-y-[-3px] w-px bg-ink-muted" style={{ left: pos(p.targetBps) }} aria-hidden />
                <div
                  className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface transition-[left] duration-300 ${
                    off ? "bg-warn" : "bg-ink"
                  }`}
                  style={{ left: pos(p.allocationBps) }}
                  aria-label={`${p.symbol} at ${(p.allocationBps / 100).toFixed(2)} percent`}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-ink-muted">
        Green is the range your plan allows; the line is the target; the dot is where you are now.
      </p>
    </Card>
  );
}
