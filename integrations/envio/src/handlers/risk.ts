/**
 * RiskSignalReceiver — risk state published by the Chainlink CRE workflow.
 *
 * These rows are the only place the portfolio's risk history carries DON consensus, as opposed to
 * being asserted by Modalis' own backend. Each one also yields a goal snapshot, because the
 * signal carries the portfolio's total value at that block.
 */
import { indexer } from "envio";
import { eventId, lower, mandateId, progressBps, riskStatusName, touchUser } from "./shared.ts";

indexer.onEvent({ contract: "RiskSignalReceiver", event: "RiskStateUpdated" }, async ({ event, context }) => {
  const p = event.params;
  const block = BigInt(event.block.number);
  const id = eventId(event.transaction.hash, event.logIndex);
  const status = riskStatusName(p.status);

  await touchUser(context, p.owner, block);

  context.RiskEvent.set({
    id,
    owner_id: lower(p.owner),
    status,
    mandateVersion: Number(p.mandateVersion),
    maxDriftBps: p.maxDriftBps,
    totalValue: p.totalValue,
    reasonHash: p.reasonHash,
    rebalanceRequired: status !== "OK",
    txHash: lower(event.transaction.hash),
    blockNumber: block,
    timestamp: BigInt(event.block.timestamp),
  });

  // Goal progress is measured against the mandate version the signal was computed for, so a
  // later mandate change never rewrites history.
  const mandate = await context.Mandate.get(mandateId(p.owner, Number(p.mandateVersion)));
  const targetValue = mandate?.targetValue ?? 0n;
  context.GoalSnapshot.set({
    id,
    owner_id: lower(p.owner),
    totalValue: p.totalValue,
    targetValue,
    progressBps: progressBps(p.totalValue, targetValue),
    blockNumber: block,
    timestamp: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "RiskSignalReceiver", event: "RebalanceRequired" }, async ({ event, context }) => {
  // RiskStateUpdated is emitted first in the same transaction and already records the state.
  // This handler exists so the event is explicitly accounted for rather than silently dropped.
  context.log.info(
    `RebalanceRequired for ${event.params.owner} at mandate v${event.params.mandateVersion}`,
  );
});
