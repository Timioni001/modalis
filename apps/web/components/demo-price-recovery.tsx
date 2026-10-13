"use client";

import { useState } from "react";
import { Button, Notice } from "./ui";
import { usePortfolio } from "./portfolio-provider";
import { ReceiptLink } from "./receipt-link";
import { apiPost } from "@/lib/client-api";

/** Recover expired synthetic quotes through the existing authenticated demo endpoint. */
export function DemoPriceRecovery() {
  const { status, refresh } = usePortfolio();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<{ reference: string }[]>([]);
  if (
    !status?.demoMode ||
    status.network.chainId !== 10143 ||
    status.prices?.ready !== false
  )
    return null;
  async function recover() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ receipts: { reference: string }[] }>(
        "/api/demo/scenario",
        { scenario: "refresh" },
      );
      setReceipts(result.receipts);
      await refresh();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "We couldn't refresh the demo prices.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Notice
      tone="warn"
      title="Demo prices need refreshing"
      action={
        <Button
          variant="secondary"
          busy={busy}
          busyLabel="Refreshing demo prices…"
          onClick={recover}
        >
          Refresh demo prices
        </Button>
      }
    >
      <p>
        Republish the same synthetic prices so you can try funding and
        adjustments again. Your plan and balances are unchanged.
      </p>
      {error ? (
        <p role="alert" className="mt-3">
          {error}
        </p>
      ) : null}
      {receipts.length ? (
        <ul className="mt-3 space-y-1">
          {receipts.map((receipt) => (
            <li key={receipt.reference}>
              <ReceiptLink reference={receipt.reference} />
            </li>
          ))}
        </ul>
      ) : null}
    </Notice>
  );
}
