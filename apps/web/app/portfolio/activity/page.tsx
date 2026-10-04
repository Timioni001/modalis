"use client";

/**
 * Portfolio history.
 *
 * Every action carries a timestamp, a reason, the assets involved, the venue and the transaction
 * that settled it. That is what makes this an investment log rather than a feed.
 *
 * Reads the Envio indexer when configured and falls back to RPC log queries otherwise, and says
 * which source answered — so the page never implies indexed history it does not have.
 */
import { useEffect, useState } from "react";
import { Badge, Card, Empty, Notice, SectionTitle } from "@/components/ui";
import { ExplorerLink } from "@/components/explorer-link";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { pct, timestampLabel, usd } from "@/lib/format";

type EnvioResponse = {
  source: "envio";
  Transaction: { id: string; type: string; token?: string; amount?: string; txHash: string; blockNumber: string; timestamp: string }[];
  Rebalance: {
    id: string;
    mandateVersion: number;
    nonce: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    tokens?: string[];
    bpsBefore?: number[];
    bpsAfter?: number[];
    txHash: string;
    blockNumber: string;
    timestamp: string;
  }[];
  RiskEvent: { id: string; status: string; maxDriftBps: string; totalValue: string; rebalanceRequired: boolean; txHash: string; blockNumber: string; timestamp: string }[];
  Mandate: {
    id: string;
    version: number;
    targetValue: string;
    maxDrawdownBps: number;
    minLiquidityBps: number;
    maxSingleAssetBps: number;
    rebalanceThresholdBps: number;
    txHash: string;
  }[];
};

type RpcResponse = {
  source: "rpc";
  note?: string;
  items: { kind: string; blockNumber: string; txHash: string; logIndex: number; args: Record<string, unknown> }[];
};

export default function ActivityPage() {
  return (
    <PortfolioGate>
      <Activity />
    </PortfolioGate>
  );
}

function Activity() {
  const { portfolio } = usePortfolio();
  const [data, setData] = useState<EnvioResponse | RpcResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!portfolio?.owner) return;
    let alive = true;
    fetch(`/api/activity/${portfolio.owner}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => alive && setError("Could not load activity."));
    return () => {
      alive = false;
    };
  }, [portfolio?.owner]);

  if (error) return <Notice tone="warn">{error}</Notice>;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunken" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Activity</h1>
          <p className="mt-2 text-ink-soft">
            Every action taken on your portfolio, with the transaction that settled it.
          </p>
        </div>
        <Badge tone={data.source === "envio" ? "ok" : "default"}>
          {data.source === "envio" ? "Indexed by Envio" : "Read from RPC logs"}
        </Badge>
      </div>

      {data.source === "rpc" && data.note ? <Notice tone="default">{data.note}</Notice> : null}

      {data.source === "envio" ? <EnvioView data={data} /> : <RpcView data={data} />}
    </div>
  );
}

function EnvioView({ data }: { data: EnvioResponse }) {
  const empty =
    data.Transaction.length === 0 && data.Rebalance.length === 0 && data.RiskEvent.length === 0;
  if (empty) {
    return <Empty title="No activity yet">Fund your portfolio and the history will appear here.</Empty>;
  }

  return (
    <div className="space-y-6">
      {data.Rebalance.length > 0 ? (
        <Card>
          <SectionTitle hint="What changed, and the allocation before and after.">Rebalances</SectionTitle>
          <ul className="divide-y divide-line">
            {data.Rebalance.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">
                    Rebalanced under mandate v{r.mandateVersion}
                  </span>
                  <span className="numeric text-xs text-ink-muted">
                    {timestampLabel(r.timestamp)} · block {r.blockNumber} · <ExplorerLink hash={r.txHash} />
                  </span>
                </div>
                {r.tokens?.length && r.bpsBefore?.length && r.bpsAfter?.length ? (
                  <ul className="numeric mt-2 grid gap-1 text-xs text-ink-soft sm:grid-cols-2">
                    {r.tokens.map((t, i) => (
                      <li key={t}>
                        {t.slice(0, 8)}… {pct(r.bpsBefore![i])} → {pct(r.bpsAfter![i])}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data.RiskEvent.length > 0 ? (
        <Card>
          <SectionTitle hint="Published on-chain by the Chainlink CRE monitoring workflow.">
            Risk signals
          </SectionTitle>
          <ul className="divide-y divide-line">
            {data.RiskEvent.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex items-center gap-3">
                  <Badge tone={e.status === "OK" ? "ok" : e.status === "DRIFT" ? "warn" : "breach"}>
                    {e.status}
                  </Badge>
                  <span className="numeric text-sm text-ink-soft">
                    drift {pct(Number(e.maxDriftBps))} · value {usd(BigInt(e.totalValue))}
                  </span>
                </div>
                <span className="numeric text-xs text-ink-muted">
                  {timestampLabel(e.timestamp)} · <ExplorerLink hash={e.txHash} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data.Mandate.length > 0 ? (
        <Card>
          <SectionTitle hint="Each version of your policy, so your financial rules are auditable.">
            Mandate history
          </SectionTitle>
          <ul className="divide-y divide-line">
            {data.Mandate.map((m, i) => {
              const prev = data.Mandate[i + 1];
              const changes = prev ? diffMandate(prev, m) : [];
              return (
                <li key={m.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-ink">Version {m.version}</span>
                    <ExplorerLink hash={m.txHash} />
                  </div>
                  {prev ? (
                    changes.length > 0 ? (
                      <ul className="numeric mt-2 space-y-1 text-sm text-ink-soft">
                        {changes.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-ink-muted">
                        Limits unchanged; the allocation was updated.
                      </p>
                    )
                  ) : (
                    <p className="mt-2 text-sm text-ink-muted">Your first mandate.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {data.Transaction.length > 0 ? (
        <Card>
          <SectionTitle>Deposits and withdrawals</SectionTitle>
          <ul className="divide-y divide-line">
            {data.Transaction.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm font-medium text-ink">{humanTxType(t.type)}</span>
                <span className="numeric text-xs text-ink-muted">
                  {timestampLabel(t.timestamp)} · <ExplorerLink hash={t.txHash} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function RpcView({ data }: { data: RpcResponse }) {
  if (data.items.length === 0) {
    return <Empty title="No activity yet">Fund your portfolio and the history will appear here.</Empty>;
  }
  return (
    <Card>
      <SectionTitle>Recent events</SectionTitle>
      <ul className="divide-y divide-line">
        {data.items.map((item) => (
          <li key={`${item.txHash}-${item.logIndex}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="text-sm font-medium text-ink">{humanEventKind(item.kind)}</span>
            <span className="numeric text-xs text-ink-muted">
              block {item.blockNumber} · <ExplorerLink hash={item.txHash} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function humanTxType(type: string): string {
  switch (type) {
    case "DEPOSIT":
      return "Deposit";
    case "WITHDRAW":
      return "Withdrawal";
    case "EMERGENCY_WITHDRAW":
      return "Emergency withdrawal";
    case "REBALANCE":
      return "Rebalance";
    default:
      return type;
  }
}

function humanEventKind(kind: string): string {
  switch (kind) {
    case "Deposited":
      return "Deposit";
    case "Withdrawn":
      return "Withdrawal";
    case "Rebalanced":
      return "Rebalance";
    case "TradeSettled":
      return "Trade settled";
    case "MandateActiveSet":
      return "Mandate status changed";
    default:
      return kind;
  }
}

/** The "what changed?" view between two mandate versions. */
function diffMandate(prev: EnvioResponse["Mandate"][number], next: EnvioResponse["Mandate"][number]): string[] {
  const rows: [string, number, number][] = [
    ["Maximum drawdown", prev.maxDrawdownBps, next.maxDrawdownBps],
    ["Liquidity reserve", prev.minLiquidityBps, next.minLiquidityBps],
    ["Maximum single asset", prev.maxSingleAssetBps, next.maxSingleAssetBps],
    ["Rebalance threshold", prev.rebalanceThresholdBps, next.rebalanceThresholdBps],
  ];
  const out = rows
    .filter(([, a, b]) => a !== b)
    .map(([label, a, b]) => `${label}: ${pct(a, 0)} → ${pct(b, 0)}`);
  if (prev.targetValue !== next.targetValue) {
    out.push(`Goal: ${usd(BigInt(prev.targetValue), { decimals: 0 })} → ${usd(BigInt(next.targetValue), { decimals: 0 })}`);
  }
  return out;
}
