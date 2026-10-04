/**
 * PortfolioVault — deposits, withdrawals and settled trades.
 *
 * Positions are maintained incrementally from these events. The vault's own `balanceOf` remains
 * the source of truth; this is the history, not the ledger.
 */
import { indexer } from "envio";
import { applyPositionDelta, eventId, lower, touchUser } from "./shared.ts";

indexer.onEvent({ contract: "PortfolioVault", event: "Deposited" }, async ({ event, context }) => {
  const { owner, token, amount } = event.params;
  const block = BigInt(event.block.number);
  await touchUser(context, owner, block);
  await applyPositionDelta(context, owner, token, amount, block);

  context.Transaction.set({
    id: eventId(event.transaction.hash, event.logIndex),
    owner_id: lower(owner),
    type: "DEPOSIT",
    token: lower(token),
    amount,
    txHash: lower(event.transaction.hash),
    blockNumber: block,
    timestamp: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "PortfolioVault", event: "Withdrawn" }, async ({ event, context }) => {
  const { owner, token, amount } = event.params;
  const block = BigInt(event.block.number);
  await touchUser(context, owner, block);
  await applyPositionDelta(context, owner, token, -amount, block);

  context.Transaction.set({
    id: eventId(event.transaction.hash, event.logIndex),
    owner_id: lower(owner),
    type: "WITHDRAW",
    token: lower(token),
    amount,
    txHash: lower(event.transaction.hash),
    blockNumber: block,
    timestamp: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "PortfolioVault", event: "TradeSettled" }, async ({ event, context }) => {
  // The trade's own Transaction row is written by the Rebalanced handler, which has the full
  // proposal context. Here we only move the positions.
  const { owner, tokenIn, tokenOut, amountIn, amountOut } = event.params;
  const block = BigInt(event.block.number);
  await applyPositionDelta(context, owner, tokenIn, -amountIn, block);
  await applyPositionDelta(context, owner, tokenOut, amountOut, block);
});

indexer.onEvent({ contract: "PortfolioVault", event: "EmergencyWithdrawn" }, async ({ event, context }) => {
  const { owner } = event.params;
  const block = BigInt(event.block.number);
  await touchUser(context, owner, block);

  // The event carries no per-token amounts, so zero every position the owner held.
  const positions = await context.Position.getWhere({ owner_id: { _eq: lower(owner) } });
  for (const p of positions) {
    context.Position.set({ ...p, amount: 0n, lastUpdatedBlock: block });
  }

  context.Transaction.set({
    id: eventId(event.transaction.hash, event.logIndex),
    owner_id: lower(owner),
    type: "EMERGENCY_WITHDRAW",
    token: undefined,
    amount: undefined,
    txHash: lower(event.transaction.hash),
    blockNumber: block,
    timestamp: BigInt(event.block.timestamp),
  });
});
