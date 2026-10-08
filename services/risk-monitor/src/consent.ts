/**
 * Whether the monitor may act for a person, and recording what it saw.
 *
 * Before this, one operator switch (RISK_MONITOR_AUTO_EXECUTE) executed adjustments for every
 * watched account at once. Automation is now each person's own choice (§33): an adjustment runs
 * without them only if the operator has enabled automatic execution AND the person's own saved
 * level is "automated" AND its timelock has passed AND the on-chain simulation against their
 * limits succeeded. With no database, nobody's choice can be read, so nothing runs automatically.
 */
import type { Address } from "viem";
import { findUserByWallet, getAutomation, recentEvents, type ModalisClient } from "@modalis/db";
import { DEFAULT_AUTOMATION, emit, mayRunWithoutAsking, type AutoDecision, type AutomationState } from "@modalis/domain";

export async function consentFor(
  db: ModalisClient | null,
  owner: Address,
  input: { operatorEnabled: boolean; simulationOk: boolean },
  now = new Date(),
): Promise<AutoDecision> {
  if (!db) return { run: false, why: "No saved data, so no one's choice of automatic changes can be read." };
  const user = await findUserByWallet(db, owner);
  const row = user ? await getAutomation(db, user.id) : null;
  const automation: AutomationState = row
    ? { level: row.level, requestedLevel: row.requested_level, effectiveAt: row.effective_at }
    : DEFAULT_AUTOMATION;
  return mayRunWithoutAsking({
    automation,
    now,
    allowedByRules: input.simulationOk,
    // A successful simulation through RebalanceExecutor already proves both of these: it reverts
    // for a paused plan and for a manager the person has not authorised.
    planPaused: !input.simulationOk,
    permissionGranted: input.simulationOk,
    operatorEnabled: input.operatorEnabled,
  });
}

/** How long the same finding stays quiet before it may notify again. */
const QUIET_HOURS = 12;

/**
 * Records a monitor finding as an event — once. The monitor runs every minute; telling someone
 * the same thing sixty times an hour is noise that trains them to ignore Modalis.
 */
export async function recordFinding(
  db: ModalisClient | null,
  owner: Address,
  type: "adjustment_proposed" | "adjustment_blocked" | "adjustment_executed",
  explanation: string,
  txHash?: string,
  now = new Date(),
): Promise<boolean> {
  if (!db) return false;
  const user = await findUserByWallet(db, owner);
  if (!user) return false;
  if (!txHash) {
    const recent = await recentEvents(db, user.id, 20);
    const same = recent.find(
      (e) =>
        e.type === type &&
        (e.payload as Record<string, unknown>)?.explanation === explanation &&
        now.getTime() - new Date(e.occurred_at).getTime() < QUIET_HOURS * 3600_000,
    );
    if (same) return false;
  }
  await emit(db, { userId: user.id, type, txHash, payload: { explanation } });
  return true;
}
