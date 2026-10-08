"use client";

/**
 * What Modalis suggests doing, and whether the person's own rules allow it.
 *
 * Laid out as a receipt in three parts, in the order someone actually asks:
 *
 *   1. WHY — what went off, in a sentence.
 *   2. WHAT — the exact move, out of one thing and into another.
 *   3. WHETHER — what the person's own rules say about it.
 *
 * The suggestion has already been checked against the live contract before it reaches here, so a
 * refusal is shown as the rules protecting them — not as an error, and never as something to work
 * around.
 */
import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Badge, Button, Card, Notice } from "./ui";
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

  // The health card owns the all-clear; this card only appears when there is a change to show.
  if (adjustment.status === "none_needed") return null;

  const shown = result ?? adjustment;

  async function approve() {
    setSubmitting(true);
    setFailure(null);
    try {
      const { adjustment: done } = await apiPost<{ adjustment: Adjustment }>(
        "/api/adjustment/execute",
      );
      setResult(done);
      await refresh();
      toast.success("Your money is back in line with your plan.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "That didn't go through.";
      setFailure(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const blocked = !shown.allowedByYourRules;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-[28px] bg-surface shadow-[var(--shadow-lift)]"
    >
      {/* A thin signal bar instead of tinting the whole card: the card stays readable, and the
          state is still obvious from across the room. */}
      <div
        aria-hidden
        className={`h-1.5 w-full ${
          blocked ? "bg-breach" : planStatus?.health === "off_plan" ? "bg-warn" : "bg-accent"
        }`}
      />

      <div className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
            Modalis suggests a change
          </h2>
          <Badge tone={planStatus?.health === "off_plan" ? "breach" : "warn"} dot>
            {planStatus?.health === "off_plan" ? "Off plan" : "Drifting"}
          </Badge>
        </div>

        {/* 1 — why */}
        <Step n={1} label="Why">
          <p className="text-[16px] leading-relaxed text-ink">{shown.explanation}</p>
          {shown.reasons.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-[14px] text-ink-soft">
              {shown.reasons.map((r, i) => (
                <li key={`${r.code}-${i}`} className="flex gap-2">
                  <span aria-hidden className="text-ink-muted">
                    &middot;
                  </span>
                  {r.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Step>

        {/* 2 — what */}
        {shown.change?.sell.name ? (
          <Step n={2} label="What would move">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sunken p-4">
              <div className="min-w-0">
                <div className="text-[12.5px] text-ink-muted">Out of</div>
                <div className="numeric mt-0.5 truncate text-[16px] font-semibold text-ink">
                  {shown.change.sell.amount} {shown.change.sell.name}
                </div>
              </div>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="h-5 w-5 flex-none text-ink-muted"
                fill="none"
              >
                <path
                  d="M3.5 10h13M12 5.5L16.5 10 12 14.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="min-w-0">
                <div className="text-[12.5px] text-ink-muted">Into, at least</div>
                <div className="numeric mt-0.5 truncate text-[16px] font-semibold text-ink">
                  {shown.change.buy.atLeast} {shown.change.buy.name}
                </div>
              </div>
            </div>
          </Step>
        ) : null}

        {/* 3 — whether the rules allow it */}
        <Step n={shown.change?.sell.name ? 3 : 2} label="What your rules say">
          {shown.status === "done" ? (
            <Notice tone="ok" title="Done">
              Your money has been moved back in line with your plan.{" "}
              {shown.receipt ? <ReceiptLink reference={shown.receipt.reference} /> : null}
            </Notice>
          ) : blocked ? (
            <Notice tone="breach" title="Your rules don't allow this">
              {shown.blockedBecause
                ? `This is ${shown.blockedBecause}. `
                : ""}
              Nothing moved, and nothing will. Modalis cannot carry this out.
            </Notice>
          ) : (
            <Notice tone="ok" title="Your rules allow this">
              Checked against the contract holding your limits before anything happens. Nothing has
              moved yet &mdash; it needs your approval.
            </Notice>
          )}
        </Step>

        {failure ? (
          <div className="mt-4">
            <Notice tone="warn">{failure}</Notice>
          </div>
        ) : null}

        {shown.status !== "done" ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              onClick={approve}
              busy={submitting}
              busyLabel="Making the change…"
              disabled={blocked || !status?.capabilities.canAdjust}
            >
              Approve this change
            </Button>
            {blocked ? (
              <span className="text-[13px] text-ink-muted">
                Your limits refused it, so there is nothing to approve.
              </span>
            ) : !status?.capabilities.canAdjust ? (
              <span className="text-[13px] text-ink-muted">
                Modalis can&rsquo;t make adjustments on this deployment.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}

/** One numbered part of the receipt. The number does the sequencing so the copy doesn't have to. */
function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 flex gap-4">
      <span
        aria-hidden
        className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-sunken text-[12px] font-semibold text-ink-muted"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {label}
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
