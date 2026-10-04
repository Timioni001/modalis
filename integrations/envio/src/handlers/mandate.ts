/**
 * PortfolioMandate — the user's investment policy, versioned.
 *
 * A mandate row is written once per version and never mutated afterwards (only `active` flips),
 * which is what makes the "Mandate History / what changed?" view auditable rather than
 * reconstructed.
 */
import { indexer } from "envio";
import { allocationId, lower, mandateId, touchUser } from "./shared.ts";

indexer.onEvent({ contract: "PortfolioMandate", event: "MandateUpdated" }, async ({ event, context }) => {
  const owner = event.params.owner;
  const version = Number(event.params.version);
  const p = event.params.params;

  await touchUser(context, owner, BigInt(event.block.number));

  const user = await context.User.get(lower(owner));
  if (user) context.User.set({ ...user, currentMandateVersion: version });

  context.Mandate.set({
    id: mandateId(owner, version),
    owner_id: lower(owner),
    version,
    targetValue: p.targetValue,
    targetDate: BigInt(p.targetDate),
    maxDrawdownBps: Number(p.maxDrawdownBps),
    minLiquidityBps: Number(p.minLiquidityBps),
    rebalanceThresholdBps: Number(p.rebalanceThresholdBps),
    maxSingleAssetBps: Number(p.maxSingleAssetBps),
    maxSlippageBps: Number(p.maxSlippageBps),
    active: true,
    createdAtBlock: BigInt(event.block.number),
    createdAtTimestamp: BigInt(event.block.timestamp),
    txHash: lower(event.transaction.hash),
  });
});

indexer.onEvent({ contract: "PortfolioMandate", event: "AllocationSet" }, async ({ event, context }) => {
  const { owner, version, token, targetBps, minBps, maxBps } = event.params;
  context.MandateAllocation.set({
    id: allocationId(owner, Number(version), token),
    mandate_id: mandateId(owner, Number(version)),
    token: lower(token),
    targetBps: Number(targetBps),
    minBps: Number(minBps),
    maxBps: Number(maxBps),
  });
});

indexer.onEvent({ contract: "PortfolioMandate", event: "MandateActiveSet" }, async ({ event, context }) => {
  const { owner, version, active } = event.params;
  const existing = await context.Mandate.get(mandateId(owner, Number(version)));
  if (existing) context.Mandate.set({ ...existing, active });
});

indexer.onEvent({ contract: "PortfolioMandate", event: "ManagerSet" }, async ({ event, context }) => {
  const { owner, manager } = event.params;
  await touchUser(context, owner, BigInt(event.block.number));
  const user = await context.User.get(lower(owner));
  if (!user) return;
  const ZERO = "0x0000000000000000000000000000000000000000";
  // Setting the manager to the zero address revokes proposal rights.
  context.User.set({ ...user, manager: lower(manager) === ZERO ? undefined : lower(manager) });
});
