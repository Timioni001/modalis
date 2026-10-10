"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { ReceiptLink } from "./receipt-link";

type Proof = {
  owner: string;
  hasPlan: boolean;
  blockNumber: string;
  limits: {
    targetValue: string;
    targetDate: number;
    maxDrawdownBps: number;
    minLiquidityBps: number;
    maxSingleAssetBps: number;
    rebalanceThresholdBps: number;
    active: boolean;
    version: number;
  };
  totalValueE18: string;
  positions: { symbol: string; valueE18: string; allocationBps: number; targetBps: number; minBps: number; maxBps: number }[];
  activity: { title: string; detail?: string; receipt: string | null }[];
  contracts: Record<string, string | null>;
};

const usd = (e18: string) =>
  `$${Number(formatEther(BigInt(e18))).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

export function ProofView({ address }: { address: string }) {
  const [proof, setProof] = useState<Proof | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/proof/${encodeURIComponent(address)}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "We couldn't read this plan.");
        setProof(body as Proof);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "We couldn't read this plan."));
  }, [address]);

  if (error) return <p className="text-sm text-breach">{error}</p>;
  if (!proof) return <p className="text-sm text-ink-muted" role="status">Reading Monad…</p>;
  if (!proof.hasPlan) return <p className="text-sm text-ink-muted">This account has no Modalis plan on this network.</p>;

  const l = proof.limits;
  const rows: [string, string][] = [
    ["Goal", `${usd(l.targetValue)} by ${new Date(l.targetDate * 1000).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`],
    ["Biggest fall they accepted", pct(l.maxDrawdownBps)],
    ["Kept available at all times", `at least ${pct(l.minLiquidityBps)}`],
    ["Most in any one holding", pct(l.maxSingleAssetBps)],
    ["Adjust when off target by", pct(l.rebalanceThresholdBps)],
    ["Plan running", l.active ? "Yes" : "Paused by the owner"],
    ["Plan version", String(l.version)],
  ];

  return (
    <div className="space-y-10 text-ink">
      <section>
        <h2 className="text-lg font-semibold">The limits</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Held in the plan contract on Monad. Modalis can&rsquo;t act outside them or change them; only the owner can.
        </p>
        <dl className="mt-4 divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="numeric font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Where the money is · {usd(proof.totalValueE18)}</h2>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
          {proof.positions.map((p) => (
            <li key={p.symbol} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
              <span className="font-medium">{p.symbol}</span>
              <span className="numeric text-ink-muted">
                {pct(p.allocationBps)} now · allowed {pct(p.minBps)}–{pct(p.maxBps)} · {usd(p.valueE18)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Every transaction</h2>
        {proof.activity.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
            {proof.activity.map((a, i) => (
              <li key={`${a.receipt}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  <span className="font-medium">{a.title}</span>
                  {a.detail ? <span className="text-ink-muted"> · {a.detail}</span> : null}
                </span>
                {a.receipt ? <ReceiptLink reference={a.receipt} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="text-sm text-ink-muted">
        <h2 className="text-base font-semibold text-ink">Check it yourself</h2>
        <p className="mt-1">
          Account <ReceiptLink address={proof.owner} />. Plan contract{" "}
          {proof.contracts.portfolioMandate ? <ReceiptLink address={proof.contracts.portfolioMandate} /> : "—"}, vault{" "}
          {proof.contracts.portfolioVault ? <ReceiptLink address={proof.contracts.portfolioVault} /> : "—"}. Read at block{" "}
          <span className="numeric">{Number(proof.blockNumber).toLocaleString("en-US")}</span>.
        </p>
      </section>
    </div>
  );
}
