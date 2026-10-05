"use client";

/**
 * What Modalis suggests doing, and whether the person's own rules allow it.
 *
 * The suggestion has already been checked against the live contract before it reaches here, so a
 * refusal is shown as the rules protecting them — not as an error.
 */
import { useState } from "react";
import { Badge, Button, Card, Notice, SectionTitle } from "./ui";
import { ReceiptLink } from "./receipt-link";
import { usePortfolio } from "./portfolio-provider";
import { apiPost } from "@/lib/client-api";
import type { Adjustment } from "@modalis/domain";

export function PendingAction() {
  const { adjustment, planStatus, status, refresh } = usePortfolio();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Adjustment | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (!adjustment) return null;

  if (adjustment.status === "none_needed") {
    return (
      <Card>
        <SectionTitle>Your plan</SectionTitle>
        <div className="flex items-start gap-3">
          <Badge tone="ok">Nothing to do</Badge>
          <p className="text-sm text-ink-soft">{planStatus?.summary ?? adjustment.explanation}</p>
        </div>
      </Card>
    );
  }

  const shown = result ?? adjustment;

  async function approve() {
    setSubmitting(true);
    setFailure(null);
    try {
      const { adjustment: done } = await apiPost<{ adjustment: Adjustment }>("/api/adjustment/execute");
      setResult(done);
      await refresh();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-accent/30 bg-accent-soft/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Modalis suggests an adjustment</SectionTitle>
        <Badge tone={planStatus?.health === "off_plan" ? "breach" : "warn"}>
          {planStatus?.health === "off_plan" ? "Off plan" : "Drifting"}
        </Badge>
      </div>

      <p className="text-ink">{shown.explanation}</p>

      {shown.reasons.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm text-ink-soft">
          {shown.reasons.map((r, i) => (
            <li key={`${r.code}-${i}`}>· {r.message}</li>
          ))}
        </ul>
      ) : null}

      {shown.change?.sell.name ? (
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Move out of</dt>
            <dd className="numeric font-semibold">
              {shown.change.sell.amount} {shown.change.sell.name}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Into, at least</dt>
            <dd className="numeric font-semibold">
              {shown.change.buy.atLeast} {shown.change.buy.name}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-5">
        {shown.status === "done" ? (
          <Notice tone="ok" title="Done">
            Your money has been moved back in line with your plan.{" "}
            {shown.receipt ? <ReceiptLink reference={shown.receipt.reference} /> : null}
          </Notice>
        ) : shown.allowedByYourRules ? (
          <Notice tone="ok" title="Your rules allow this">
            Checked against your plan before anything happens. Nothing has moved yet.
          </Notice>
        ) : (
          <Notice tone="breach" title="Your rules don't allow this">
            {shown.explanation}
            {shown.blockedBecause ? ` This is ${shown.blockedBecause}.` : ""} Nothing moved.
          </Notice>
        )}
      </div>

      {failure ? (
        <div className="mt-4">
          <Notice tone="warn">{failure}</Notice>
        </div>
      ) : null}

      {shown.status !== "done" ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={approve} disabled={submitting || !shown.allowedByYourRules || !status?.capabilities.canAdjust}>
            {submitting ? "Making the change…" : "Approve this adjustment"}
          </Button>
          {!status?.capabilities.canAdjust ? (
            <span className="text-xs text-ink-muted">
              Modalis can&rsquo;t make adjustments on this deployment.
            </span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
