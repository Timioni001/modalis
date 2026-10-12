"use client";

/**
 * Demonstration controls, shown only on a demo deployment.
 *
 * Two buttons with very different meanings, and the copy must not blur them:
 *
 *  - "Simulate a market move" writes a MADE-UP price. Everything that follows from it is real.
 *  - "Test my rules" submits a genuinely invalid change and lets the person's own rules refuse it
 *    on-chain. That transaction is real and the refusal is verifiable.
 */
import { useState } from "react";
import { Badge, Button, Card, Notice, SectionTitle } from "./ui";
import { ReceiptLink } from "./receipt-link";
import { usePortfolio } from "./portfolio-provider";
import { apiPost } from "@/lib/client-api";

type ScenarioResult = { title?: string; description?: string; receipts?: { reference: string }[] };
type SecurityResult = {
  stoppedByYourRules?: boolean;
  explanation?: string;
  moneyUnchanged?: boolean;
  receipt?: { reference: string };
};

export function DemoControls() {
  const { refresh, status } = usePortfolio();
  const [busy, setBusy] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [security, setSecurity] = useState<SecurityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string) {
    setBusy(id);
    setError(null);
    setScenario(null);
    try {
      setScenario(await apiPost<ScenarioResult>("/api/demo/scenario", { scenario: id }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function testRules() {
    setBusy("security");
    setError(null);
    setSecurity(null);
    try {
      setSecurity(await apiPost<SecurityResult>("/api/demo/security-test"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  // Off a demo deployment both buttons would only answer "not available", so don't offer them.
  if (!status?.demoMode) return null;

  return (
    <Card className="border-dashed">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle hint="Available because this is a demonstration deployment.">
          Try it out
        </SectionTitle>
        <Button variant="quiet" href="/app/tour">
          Take the 2-minute tour
        </Button>
        <Badge tone="warn">Test network only</Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => run("off_target")} disabled={busy !== null}>
          {busy === "off_target" ? "Working…" : "Simulate a market move"}
        </Button>
        <Button variant="secondary" onClick={() => run("reset")} disabled={busy !== null}>
          {busy === "reset" ? "Resetting…" : "Reset"}
        </Button>
        <Button variant="danger" onClick={testRules} disabled={busy !== null}>
          {busy === "security" ? "Testing…" : "Test my rules"}
        </Button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-muted">
        The market move uses a <strong>made-up price</strong>. Everything after it &mdash; your plan
        going off target, the suggestion, your rules&rsquo; decision and the result &mdash; is real.
      </p>

      {error ? (
        <div className="mt-4">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}

      {scenario ? (
        <div className="mt-4">
          <Notice tone="accent" title={scenario.title ?? "Done"}>
            <p>{scenario.description}</p>
            {scenario.receipts?.length ? (
              <ul className="mt-2 space-y-1">
                {scenario.receipts.map((r) => (
                  <li key={r.reference}>
                    <ReceiptLink reference={r.reference} />
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
            tone={security.stoppedByYourRules ? "ok" : "breach"}
            title={
              security.stoppedByYourRules
                ? "Your rules stopped it"
                : "Your rules did NOT stop it"
            }
          >
            <p>{security.explanation}</p>
            {security.receipt ? (
              <p className="mt-2">
                <ReceiptLink reference={security.receipt.reference} /> &mdash; refused.
              </p>
            ) : null}
            <p className="mt-1">
              Your money is unchanged: <strong>{security.moneyUnchanged ? "yes" : "no"}</strong>.
            </p>
            <p className="mt-2 text-xs">
              That change was correctly formed and properly signed. Only your own rules stopped it.
            </p>
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}
