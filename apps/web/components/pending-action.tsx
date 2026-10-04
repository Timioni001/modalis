"use client";

/**
 * What Modalis proposes to do, and why.
 *
 * The proposal shown here has already been simulated against live chain state, so the user sees
 * whether the contract will accept it BEFORE anything is submitted. When the mandate refuses a
 * proposal, that refusal is shown as the system working — not as an error.
 */
import { useState } from "react";
import { Badge, Button, Card, Notice, SectionTitle } from "./ui";
import { ExplorerLink } from "./explorer-link";
import { usePortfolio } from "./portfolio-provider";
import { pct, tokenAmount } from "@/lib/format";

export function PendingAction() {
  const { risk, portfolio, refresh, status } = usePortfolio();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { kind: "settled"; hash: string; blockNumber?: string | null }
    | { kind: "rejected"; errorName: string; explanation: string }
    | { kind: "failed"; message: string }
    | null
  >(null);

  const state = portfolio?.state;
  if (!risk || !state) return null;

  if (risk.kind === "within_mandate" || risk.kind === "empty_portfolio") {
    return (
      <Card>
        <SectionTitle>Portfolio health</SectionTitle>
        <div className="flex items-start gap-3">
          <Badge tone="ok">No action needed</Badge>
          <p className="text-sm text-ink-soft">
            {portfolio?.riskSummary ??
              "Your portfolio is within every rule you approved, so Modalis is doing nothing."}
          </p>
        </div>
      </Card>
    );
  }

  const action = risk.proposal;
  const symbolFor = (token: string) =>
    state.positions.find((p) => p.token.toLowerCase() === token.toLowerCase());

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/rebalance/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: portfolio?.owner }),
      });
      const json = await res.json();
      if (json.rejectedBy === "mandate") {
        setResult({ kind: "rejected", errorName: json.errorName, explanation: json.explanation });
      } else if (json.submitted && json.hash && !json.rejectedWith) {
        setResult({ kind: "settled", hash: json.hash, blockNumber: json.blockNumber });
      } else {
        setResult({ kind: "failed", message: json.error ?? json.rejectedWith ?? json.reason ?? "Could not settle." });
      }
      await refresh();
    } catch {
      setResult({ kind: "failed", message: "Could not reach the Modalis server." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-accent/30 bg-accent-soft/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Modalis proposes a rebalance</SectionTitle>
        <Badge tone={risk.risk?.status === "BREACH" ? "breach" : "warn"}>
          {risk.risk?.status === "BREACH" ? "Outside your mandate" : "Drifted past your threshold"}
        </Badge>
      </div>

      {risk.unplannable ? (
        <Notice tone="warn" title="No single trade fixes this">
          {risk.unplannable}
        </Notice>
      ) : null}

      {action ? (
        <>
          <p className="text-ink">{action.explanation}</p>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Sell</dt>
              <dd className="numeric font-semibold">
                {(() => {
                  const p = symbolFor(action.proposal.tokenIn);
                  return p
                    ? `${tokenAmount(BigInt(action.proposal.amountIn), p.decimals)} ${p.symbol}`
                    : action.proposal.amountIn;
                })()}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Buy, at least</dt>
              <dd className="numeric font-semibold">
                {(() => {
                  const p = symbolFor(action.proposal.tokenOut);
                  return p
                    ? `${tokenAmount(BigInt(action.proposal.minAmountOut), p.decimals)} ${p.symbol}`
                    : action.proposal.minAmountOut;
                })()}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Venue</dt>
              <dd className="font-semibold">
                {action.venue.name === "kuru" ? "Kuru orderbook" : "Demo adapter"}
                {action.venue.isDemoVenue ? (
                  <span className="ml-2 text-xs font-normal text-ink-muted">not a real venue</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Checked against</dt>
              <dd className="numeric font-semibold">
                mandate v{action.proposal.mandateVersion}, nonce {action.proposal.nonce}
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            {action.simulation.ok ? (
              <Notice tone="ok" title="The mandate accepts this action">
                Simulated against live chain state: the portfolio would end up back inside every
                rule you approved. Nothing has been submitted yet.
              </Notice>
            ) : (
              <Notice tone="breach" title={`The mandate refuses this action (${action.simulation.errorName})`}>
                {action.simulation.explanation} Modalis will not submit it.
              </Notice>
            )}
          </div>

          {result?.kind === "settled" ? (
            <div className="mt-4">
              <Notice tone="ok" title="Settled on Monad">
                Transaction <ExplorerLink hash={result.hash} />
                {result.blockNumber ? ` in block ${result.blockNumber}` : ""}.
              </Notice>
            </div>
          ) : null}
          {result?.kind === "rejected" ? (
            <div className="mt-4">
              <Notice tone="breach" title={`Rejected by your mandate (${result.errorName})`}>
                {result.explanation}
              </Notice>
            </div>
          ) : null}
          {result?.kind === "failed" ? (
            <div className="mt-4">
              <Notice tone="warn">{result.message}</Notice>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={submitting || !action.simulation.ok || !status?.managerConfigured}>
              {submitting ? "Submitting…" : "Approve and execute"}
            </Button>
            {!status?.managerConfigured ? (
              <span className="text-xs text-ink-muted">
                No manager key configured on the server, so Modalis cannot submit this for you.
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}
