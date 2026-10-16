"use client";

/**
 * Reading Monad straight from the browser.
 *
 * Two uses, both about showing what Monad's speed actually feels like:
 *  - waiting for a transaction the person just signed until it is in a block, and saying how long
 *    that took ("Confirmed in 0.6s") instead of claiming "done" the moment a hash comes back;
 *  - re-reading a portfolio every block for the live drift meter.
 *
 * Read-only: nothing here can sign.
 */
import { createMonadPublicClient } from "@modalis/chain";
import type { Hex, PublicClient } from "viem";

let cached: { key: string; client: PublicClient } | null = null;

export function browserClient(chainId: number, rpcUrl?: string): PublicClient {
  const key = `${chainId}:${rpcUrl ?? ""}`;
  if (cached?.key === key) return cached.client;
  const loopback = rpcUrl ? ["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpcUrl).hostname) : false;
  const client = createMonadPublicClient({ chainId, httpUrl: rpcUrl, multicall: !loopback });
  cached = { key, client };
  return client;
}

export type Confirmation = { ms: number; blockNumber: bigint };

/**
 * Waits until `hash` is in a block, polling fast because Monad blocks are ~0.4s apart.
 * Measured from when the wallet handed back the hash, i.e. after the person signed.
 * Throws if the transaction reverted, so a failed step is never shown as done.
 */
export async function confirmOnChain(
  hash: Hex,
  cfg: { chainId: number; rpcUrl?: string },
  sentAt: number = performance.now(),
): Promise<Confirmation> {
  const receipt = await browserClient(cfg.chainId, cfg.rpcUrl).waitForTransactionReceipt({
    hash,
    pollingInterval: 150,
    timeout: 90_000,
  });
  if (receipt.status !== "success") throw new Error("The network rejected that transaction. Nothing moved.");
  return { ms: Math.max(0, Math.round(performance.now() - sentAt)), blockNumber: receipt.blockNumber };
}

export function secondsLabel(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}
