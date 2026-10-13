"use client";

/**
 * "Can I afford this?" — how a purchase paid from your savings delays each goal.
 *
 * Arithmetic only (lib/afford.ts): the purchase comes out of the goals in reverse funding order,
 * and each goal that loses money is late by however many of its own monthly amounts it takes to
 * win it back. No growth is assumed, so the answer never depends on the market being kind.
 */
import { useEffect, useMemo, useState } from "react";
import type { GoalsView } from "@modalis/domain";
import { Card, MoneyField, Notice, SectionTitle } from "@/components/ui";
import { apiGet } from "@/lib/client-api";
import { affordability } from "@/lib/afford";
import { usePortfolio } from "./portfolio-provider";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const months = (n: number) => (n === 1 ? "1 month" : `${n} months`);

export function AffordCheck() {
  const { address, money } = usePortfolio();
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [view, setView] = useState<GoalsView | null>(null);
  const [price, setPrice] = useState(800);

  useEffect(() => {
    const controller = new AbortController();
    setView(null);
    setLoadedFor(null);
    if (address && money)
      void apiGet<GoalsView>("/api/goals", controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) {
            setView(next);
            setLoadedFor(address);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setView(null);
        });
    return () => controller.abort();
  }, [address, money]);

  const goals = useMemo(
    () =>
      (view?.goals ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        saved: Number(g.saved.amount),
        monthly: Number(g.monthly.amount),
      })),
    [view],
  );
  const result = useMemo(() => affordability(goals, price), [goals, price]);

  if (!money || loadedFor !== address || !view || goals.length === 0)
    return null;

  return (
    <Card>
      <SectionTitle hint="Nothing is spent. This shows what paying for it from your savings would cost your goals, assuming no growth.">
        Can I afford this?
      </SectionTitle>
      <div className="max-w-xs">
        <MoneyField
          id="afford"
          value={price}
          max={100_000_000}
          onChange={setPrice}
        />
      </div>

      <ul className="mt-4 space-y-2" aria-live="polite">
        {price > 0 && result.hits.length === 0 && result.uncovered === 0 ? (
          <li className="text-[15px] text-ink">
            Nothing is saved yet, so there&rsquo;s nothing for it to come out
            of.
          </li>
        ) : null}
        {result.hits.map((h) => (
          <li
            key={h.id}
            className="flex items-start gap-2.5 text-[15px] text-ink"
          >
            <span
              aria-hidden
              className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-warn"
            />
            <span>
              <strong>{h.name}</strong> gives up {usd(h.takes)}
              {h.delayMonths !== null
                ? ` and arrives about ${months(h.delayMonths)} later.`
                : ". It has no monthly amount, so it only catches up when you add money."}
            </span>
          </li>
        ))}
      </ul>

      {result.uncovered > 0 ? (
        <div className="mt-4">
          <Notice tone="warn">
            That&rsquo;s {usd(result.uncovered)} more than everything saved
            toward your goals.
          </Notice>
        </div>
      ) : null}
      {result.hits.length > 0 && result.uncovered === 0 ? (
        <p className="mt-4 text-[13.5px] text-ink-muted">
          Your last-funded goal pays first, because your savings fill goals in
          order.
        </p>
      ) : null}
    </Card>
  );
}
