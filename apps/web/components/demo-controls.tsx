"use client";

/**
 * Demo controls, shown only when DEMO_MODE is on.
 *
 * Two buttons with very different meanings, and the UI must not blur them:
 *
 *  - "Simulate a market move" writes a SYNTHETIC price to the demo oracle. The price is made up;
 *    the breach it causes, and everything after it, is real.
 *  - "Run the security test" submits a genuinely invalid proposal and lets the contract reject it
 *    on-chain. That transaction is real and its revert is verifiable.
 */
import { useState } from "react";
import { Badge, Button, Card, Notice, SectionTitle } from "./ui";
import { ExplorerLink } from "./explorer-link";
import { usePortfolio } from "./portfolio-provider";

type ScenarioResult = { title?: string; description?: string; writes?: { symbol: string; hash: string }[] };
type SecurityResult = {
  hash?: string;
  reverted?: boolean;
  errorName?: string | null;
  explanation?: string;
  portfolioUnchanged?: boolean;
  error?: string;
};

export function DemoControls() {
  const { portfolio, refresh } = usePortfolio();
  const [busy, setBusy] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [security, setSecurity] = useState<SecurityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScenario(id: string) {
    // The breach scenario is computed from this portfolio's live holdings, so it needs the owner.
    setBusy(id);
    setError(null);
    setScenario(null);
    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: id, owner: portfolio?.owner }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Could not run the scenario.");
      else setScenario(json);
      await refresh();
    } catch {
      setError("Could not reach the Modalis server.");
    } finally {
      setBusy(null);
    }
  }

  async function runSecurityTest() {
    setBusy("security");
    setError(null);
    setSecurity(null);
    try {
      const res = await fetch("/api/rebalance/invalid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: portfolio?.owner }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Could not run the security test.");
      else setSecurity(json);
      await refresh();
    } catch {
      setError("Could not reach the Modalis server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-dashed">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle hint="Available because this deployment runs with DEMO_MODE enabled.">
          Demo controls
        </SectionTitle>
        <Badge tone="warn">Test network only</Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => runScenario("breach_largest")} disabled={busy !== null}>
          {busy === "breach_largest" ? "Writing prices…" : "Simulate a market move"}
        </Button>
        <Button variant="secondary" onClick={() => runScenario("reset")} disabled={busy !== null}>
          {busy === "reset" ? "Resetting…" : "Reset demo prices"}
        </Button>
        <Button variant="danger" onClick={runSecurityTest} disabled={busy !== null}>
          {busy === "security" ? "Submitting…" : "Run the security test"}
        </Button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-muted">
        The market move writes a <strong>synthetic price</strong> to the demo oracle. Everything
        downstream of it &mdash; the breach, the proposal, the contract&rsquo;s decision and the
        settlement &mdash; is real, and every transaction hash below came from the network.
      </p>

      {error ? (
        <div className="mt-4">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}

      {scenario ? (
        <div className="mt-4">
          <Notice tone="accent" title={scenario.title ?? "Scenario run"}>
            <p>{scenario.description ?? "Demo prices updated."}</p>
            {scenario.writes?.length ? (
              <ul className="mt-2 space-y-1">
                {scenario.writes.map((w) => (
                  <li key={w.hash}>
                    {w.symbol} price written: <ExplorerLink hash={w.hash} />
                  </li>
                ))}
              </ul>
            ) : null}
          </Notice>
        </div>
      ) : null}

      {security ? (
        <div className="mt-4">
          <Notice
            tone={security.reverted ? "ok" : "breach"}
            title={
              security.reverted
                ? `The contract rejected the invalid action (${security.errorName ?? "reverted"})`
                : "The contract did NOT reject the invalid action"
            }
          >
            <p>{security.explanation}</p>
            {security.hash ? (
              <p className="mt-2">
                Transaction <ExplorerLink hash={security.hash} /> &mdash;{" "}
                {security.reverted ? "reverted on-chain" : "succeeded"}.
              </p>
            ) : null}
            {security.portfolioUnchanged !== undefined ? (
              <p className="mt-1">
                Portfolio unchanged: <strong>{security.portfolioUnchanged ? "yes" : "no"}</strong>.
              </p>
            ) : null}
            <p className="mt-2 text-xs">
              The proposal was well-formed and correctly signed. Only the mandate stopped it &mdash;
              which is the point: the AI is not the security boundary.
            </p>
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}
