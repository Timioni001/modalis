/**
 * RebalanceExecutor — settled rebalances and their before/after allocation.
 *
 * Only SUCCESSFUL rebalances appear here: a proposal the mandate rejects reverts the whole
 * transaction, so it emits nothing. The absence of a row is itself the record that the mandate
 * held. Rejections are surfaced from the proposal table in Postgres, not from chain history.
 */
import { indexer } from "envio";
import { eventId, lower, rebalanceId, touchUser } from "./shared.ts";

indexer.onEvent({ contract: "RebalanceExecutor", event: "Rebalanced" }, async ({ event, context }) => {
  const p = event.params;
  const block = BigInt(event.block.number);
  await touchUser(context, p.owner, block);

  const id = rebalanceId(p.owner, p.nonce);
  const existing = await context.Rebalance.get(id);

  context.Rebalance.set({
    id,
    owner_id: lower(p.owner),
    mandateVersion: Number(p.mandateVersion),
    nonce: p.nonce,
    adapter: lower(p.adapter),
    tokenIn: lower(p.tokenIn),
    tokenOut: lower(p.tokenOut),
    amountIn: p.amountIn,
    amountOut: p.amountOut,
    reasonHash: p.reasonHash,
    // AllocationSnapshot is emitted in the same transaction; keep whichever arrived first.
    tokens: existing?.tokens,
    bpsBefore: existing?.bpsBefore,
    bpsAfter: existing?.bpsAfter,
    txHash: lower(event.transaction.hash),
    blockNumber: block,
    timestamp: BigInt(event.block.timestamp),
  });

  context.Transaction.set({
    id: eventId(event.transaction.hash, event.logIndex),
    owner_id: lower(p.owner),
    type: "REBALANCE",
    token: lower(p.tokenIn),
    amount: p.amountIn,
    txHash: lower(event.transaction.hash),
    blockNumber: block,
    timestamp: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "RebalanceExecutor", event: "AllocationSnapshot" }, async ({ event, context }) => {
  const { owner, nonce, tokens, bpsBefore, bpsAfter } = event.params;
  const id = rebalanceId(owner, nonce);
  const existing = await context.Rebalance.get(id);

  const snapshot = {
    tokens: tokens.map(lower),
    bpsBefore: bpsBefore.map((b) => Number(b)),
    bpsAfter: bpsAfter.map((b) => Number(b)),
  };

  if (existing) {
    context.Rebalance.set({ ...existing, ...snapshot });
    return;
  }

  // Snapshot arrived before Rebalanced (same transaction, lower log index). Write a stub the
  // Rebalanced handler then completes, so no ordering assumption is baked in.
  const block = BigInt(event.block.number);
  await touchUser(context, owner, block);
  context.Rebalance.set({
    id,
    owner_id: lower(owner),
    mandateVersion: 0,
    nonce,
    adapter: "",
    tokenIn: "",
    tokenOut: "",
    amountIn: 0n,
    amountOut: 0n,
    reasonHash: "",
    ...snapshot,
    txHash: lower(event.transaction.hash),
    blockNumber: block,
    timestamp: BigInt(event.block.timestamp),
  });
});
