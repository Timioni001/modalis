/** Reading and changing the person's automation level. Server-written only (RLS refuses the browser). */
import { getAddress, type Address } from "viem";
import { findUserByWallet, getAutomation, saveAutomation, upsertUser } from "@modalis/db";
import { DomainError, type DomainContext } from "../context.ts";
import {
  AUTOMATION_DELAY_HOURS,
  DEFAULT_AUTOMATION,
  effectiveAutomation,
  requestAutomation,
  type AutomationLevel,
  type AutomationState,
} from "../automation.ts";
import { emit } from "./events.ts";

export type AutomationView = AutomationState & { delayHours: number; saved: boolean };

function fromRow(row: { level: AutomationLevel; requested_level: AutomationLevel | null; effective_at: string | null } | null): AutomationState {
  return row ? { level: row.level, requestedLevel: row.requested_level, effectiveAt: row.effective_at } : DEFAULT_AUTOMATION;
}

/** The level in force now. A raise whose wait is over is promoted and announced, once. */
export async function automationFor(ctx: DomainContext, owner: Address, now = new Date()): Promise<AutomationView> {
  if (!ctx.db) return { ...DEFAULT_AUTOMATION, delayHours: AUTOMATION_DELAY_HOURS, saved: false };
  const user = await findUserByWallet(ctx.db, getAddress(owner));
  if (!user) return { ...DEFAULT_AUTOMATION, delayHours: AUTOMATION_DELAY_HOURS, saved: true };
  const stored = fromRow(await getAutomation(ctx.db, user.id));
  const live = effectiveAutomation(stored, now);
  if (live.level !== stored.level) {
    await saveAutomation(ctx.db, user.id, { level: live.level, requestedLevel: null, effectiveAt: null });
    await emit(ctx.db, { userId: user.id, type: "automation_effective", payload: { level: live.level } });
  }
  return { ...live, delayHours: AUTOMATION_DELAY_HOURS, saved: true };
}

export async function setAutomation(
  ctx: DomainContext,
  owner: Address,
  wanted: AutomationLevel,
  now = new Date(),
): Promise<AutomationView> {
  if (!ctx.db) throw new DomainError("no_database", "Automation settings need saved data, which isn't set up here.", 503);
  const user = await upsertUser(ctx.db, { walletAddress: getAddress(owner), chainId: ctx.deployment.chainId });
  if (!user) throw new DomainError("save_failed", "We couldn't save that. Try again shortly.", 503);

  const current = fromRow(await getAutomation(ctx.db, user.id));
  const next = requestAutomation(current, wanted, now);
  const saved = await saveAutomation(ctx.db, user.id, {
    level: next.level,
    requestedLevel: next.requestedLevel,
    effectiveAt: next.effectiveAt,
  });
  if (!saved) throw new DomainError("save_failed", "We couldn't save that. Try again shortly.", 503);

  if (next.requestedLevel) {
    await emit(ctx.db, {
      userId: user.id,
      type: "automation_requested",
      payload: {
        level: next.requestedLevel,
        message: `Automatic changes switch on ${new Date(next.effectiveAt!).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC. You can cancel before then.`,
      },
    });
  }
  return { ...next, delayHours: AUTOMATION_DELAY_HOURS, saved: true };
}
