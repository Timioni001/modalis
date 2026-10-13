"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MockPriceOracleAbi } from "@modalis/chain";
import type { Address } from "viem";
import { Button, Notice } from "./ui";
import { usePortfolio } from "./portfolio-provider";
import { useWallet, useWalletConfig } from "./wallet-context";
import { ReceiptLink } from "./receipt-link";
import { apiPost } from "@/lib/client-api";
import { browserClient, confirmOnChain } from "@/lib/chain-client";

/** One compact recovery state, with real owner checks rather than a repeated generic warning. */
export function DemoPriceRecovery() {
  const { status, refresh, loading } = usePortfolio();
  const { address, getWalletClient } = useWallet();
  const { rpcUrl, chainId } = useWalletConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<{ reference: string }[]>([]);
  const directOwner = Boolean(
    address &&
      status?.prices?.recovery?.owner?.toLowerCase() === address.toLowerCase(),
  );
  const canRefresh = Boolean(
    status?.prices?.recovery?.canRefresh || directOwner,
  );
  if (status?.prices?.ready !== false) return null;
  async function recover() {
    setBusy(true);
    setError(null);
    try {
      if (status?.prices?.recovery?.canRefresh) {
        const result = await apiPost<{ receipts: { reference: string }[] }>(
          "/api/demo/prices",
          {},
        );
        setReceipts(result.receipts);
      } else if (directOwner && status?.demoMode && chainId === 10143) {
        const oracle = status.technical!.contracts.priceOracle as Address;
        const client = browserClient(chainId, rpcUrl);
        const wallet = await getWalletClient();
        const owner = await client.readContract({
          address: oracle,
          abi: MockPriceOracleAbi,
          functionName: "owner",
        });
        if (owner.toLowerCase() !== address?.toLowerCase())
          throw new Error(
            "This account does not own the demo pricing contract.",
          );
        for (const token of Object.values(status.technical!.tokens)) {
          const [value] = await client.readContract({
            address: oracle,
            abi: MockPriceOracleAbi,
            functionName: "quotes",
            args: [token as Address],
          });
          if (value <= 0n)
            throw new Error("This demo asset has no recorded price.");
          const hash = await wallet.writeContract({
            address: oracle,
            abi: MockPriceOracleAbi,
            functionName: "setPrice",
            args: [token as Address, value],
            account: wallet.account!,
            chain: wallet.chain,
          });
          await confirmOnChain(hash, { chainId, rpcUrl });
          setReceipts((all) => [...all, { reference: hash }]);
        }
      }
      await refresh();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The pricing refresh could not finish.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-warn/20 bg-surface p-5 shadow-[var(--shadow-card)]"
      aria-label="Portfolio price availability"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-ink-muted">
            <span
              className={`h-2 w-2 rounded-full ${busy || loading ? "animate-pulse bg-accent" : "bg-warn"}`}
            />
            Portfolio pricing
          </div>
          <h2 className="text-lg font-semibold">
            {busy || loading
              ? "Updating demo prices"
              : "Your plan is safe. Pricing is paused."}
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
            Payments, saved goals and asset quantities remain available. Dollar
            totals and portfolio actions return when fresh prices are confirmed.
          </p>
        </div>
        {status.demoMode && chainId === 10143 && canRefresh ? (
          <Button variant="secondary" busy={busy || loading} onClick={recover}>
            Refresh demo prices
          </Button>
        ) : (
          <Button variant="secondary" href="/app/payments">
            Use payments
          </Button>
        )}
      </div>
      {!canRefresh ? (
        <p className="mt-3 text-xs text-ink-muted">
          The demo operator needs to restore pricing. Refreshing this page
          cannot update an expired quote.
        </p>
      ) : (
        <p className="mt-3 text-xs text-ink-muted">
          Refreshing republishes the same synthetic prices. It does not change
          your plan or transfer your assets.
        </p>
      )}
      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4"
          >
            <Notice tone="warn">{error}</Notice>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {receipts.length ? (
        <details className="mt-3 text-xs">
          <summary className="min-h-11 cursor-pointer">
            Confirmed refresh receipts
          </summary>
          <ul>
            {receipts.map((receipt) => (
              <li key={receipt.reference}>
                <ReceiptLink reference={receipt.reference} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </motion.section>
  );
}
