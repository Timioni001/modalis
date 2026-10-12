"use client";

/**
 * The public live numbers. Every figure comes from /api/stats, which reads Monad and the
 * on-chain-verified transaction record; a figure this deployment can't produce is left out, not
 * filled in.
 */
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { ReceiptLink } from "./receipt-link";
import { ENVIO_LIMIT } from "@/lib/envio-stats";

type Stats = {
  chain: { blockNumber: string; blockTimeMs: number; gasPriceWei: string; typicalFeeWei: string };
  heldE18: string | null;
  activity: {
    plans: number | null;
    transactionsThisWeek: number | null;
    adjustmentsThisWeek: number | null;
    recent: { hash: string; type: string; at: string }[];
    source?: "envio" | "database" | null;
  };
};

const TYPE_LABEL: Record<string, string> = {
  mandate_set: "Plan approved",
  deposit: "Money added",
  withdraw: "Money withdrawn",
  rebalance: "Adjustment",
  approve: "Allowance",
  emergency_withdraw: "Emergency withdrawal",
  other: "Plan change",
};

export function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const body = (await res.json()) as Stats;
        if (!stopped) {
          setStats(body);
          setFailed(false);
        }
      } catch {
        if (!stopped) setFailed(true);
      }
    };
    void load();
    const id = setInterval(load, 5_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  if (!stats) {
    return (
      <p className="text-sm text-ink-muted" role="status">
        {failed ? "Can't reach the network right now." : "Reading Monad…"}
      </p>
    );
  }

  const fee = Number(formatEther(BigInt(stats.chain.typicalFeeWei)));
  const envio = stats.activity.source === "envio";
  // The indexer query is capped, so a count at the cap means "at least this many".
  const count = (n: number) => (envio && n >= ENVIO_LIMIT ? `${ENVIO_LIMIT.toLocaleString("en-US")}+` : String(n));

  const tiles: { label: string; value: string; note: string }[] = [
    {
      label: "Block time",
      value: `${(stats.chain.blockTimeMs / 1000).toFixed(2)}s`,
      note: "Measured over the last 100 Monad blocks",
    },
    {
      label: "Fee per transaction",
      value: `${fee < 0.0001 ? fee.toExponential(1) : fee.toFixed(4)} MON`,
      note: "About 70,000 gas at the current price",
    },
    ...(stats.heldE18 != null
      ? [
          {
            label: "Money in Modalis",
            value: `$${Number(formatEther(BigInt(stats.heldE18))).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
            note: "Demo tokens in the vault, valued by the on-chain registry",
          },
        ]
      : []),
    ...(stats.activity.plans != null
      ? [{ label: "Plans approved", value: count(stats.activity.plans), note: "Each one a contract call on Monad" }]
      : []),
    ...(stats.activity.transactionsThisWeek != null
      ? [{ label: "Transactions this week", value: count(stats.activity.transactionsThisWeek), note: envio ? "Indexed by Envio from Monad" : "Checked on-chain before being counted" }]
      : []),
    ...(stats.activity.adjustmentsThisWeek != null
      ? [{ label: "Adjustments this week", value: count(stats.activity.adjustmentsThisWeek), note: "Every one checked by the contract first" }]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-ok" aria-hidden />
        Live from Monad testnet · block <span className="numeric">{Number(stats.chain.blockNumber).toLocaleString("en-US")}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-card)]">
            <div className="text-sm text-ink-muted">{t.label}</div>
            <div className="numeric mt-2 text-3xl font-semibold text-ink">{t.value}</div>
            <div className="mt-2 text-xs text-ink-muted">{t.note}</div>
          </div>
        ))}
      </div>

      {stats.activity.recent.length ? (
        <div>
          <h2 className="text-lg font-semibold text-ink">Latest transactions</h2>
          {stats.activity.source === "envio" ? (
            <p className="mt-1 text-sm text-ink-muted">Indexed by Envio, straight from Monad.</p>
          ) : null}
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
            {stats.activity.recent.map((r, i) => (
              <li key={`${r.hash}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="text-ink">{TYPE_LABEL[r.type] ?? "Transaction"}</span>
                <span className="flex items-center gap-3 text-ink-muted">
                  <span className="text-xs">{new Date(r.at).toLocaleString()}</span>
                  <ReceiptLink reference={r.hash} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
