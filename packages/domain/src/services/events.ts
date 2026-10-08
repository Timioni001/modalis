/**
 * Domain events and the notifications they cause (§36, §37).
 *
 * One function, `emit`, is the only way an event enters the system. It appends the event and,
 * where the event is something a person should hear about, writes the notification in the same
 * breath — so a notification can never exist for something that did not happen, and nothing that
 * happened can silently skip its notification.
 *
 * Wording lives here, in the product's language, next to the event it describes. Every sentence
 * is built from the event's own payload; none is invented.
 *
 * Persistence failures never reach the caller (see @modalis/db `tolerate`): an event is a record
 * of something that already happened on-chain, and failing to write the record must not undo it.
 */
import {
  createNotification,
  findUserByWallet,
  recentEvents,
  recordEvent,
  type DomainEventType,
  type Json,
  type ModalisClient,
  type NotificationKind,
} from "@modalis/db";
import { goalBookFor } from "./goals.ts";

type Note = { kind: NotificationKind; title: string; body: string };

/** Which events become notifications, and what they say. `null` means: record, don't notify. */
export function notificationFor(type: DomainEventType, payload: Record<string, unknown>): Note | null {
  const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
  switch (type) {
    case "plan_approved":
      return { kind: "done", title: "Your plan is live", body: s("reason") || "Your limits are now on record. Modalis manages your money inside them." };
    case "money_added":
      return { kind: "done", title: "Money added", body: s("amount") ? `${s("amount")} is in your plan.` : "Your money is in your plan." };
    case "money_withdrawn":
      return { kind: "done", title: "Money withdrawn", body: s("amount") ? `${s("amount")} went back to your account.` : "Your money went back to your account." };
    case "adjustment_executed":
      return { kind: "done", title: "Your plan was adjusted", body: s("explanation") || "Your money is back in line with your plan." };
    case "adjustment_blocked":
      return { kind: "safety", title: "Your rules refused a change", body: s("explanation") || "A suggested change went past one of your limits, so nothing moved." };
    case "adjustment_proposed":
      return { kind: "attention", title: "A change is waiting for you", body: s("explanation") || "Modalis suggests a change to keep your plan on track." };
    case "glide_step_due":
      return { kind: "attention", title: "Time to make your plan steadier", body: s("message") || "Your goal is getting close. A steadier mix would protect what you've built." };
    case "goal_milestone":
      return { kind: "done", title: s("title") || "A milestone", body: s("message") || "You reached a milestone on your goal." };
    case "automation_requested":
      return { kind: "attention", title: "Automatic adjustments requested", body: s("message") || "They switch on after a waiting period. You can cancel before then." };
    case "automation_effective":
      return { kind: "info", title: "Automatic adjustments are on", body: "Modalis may now make changes your plan allows without asking. Your limits still apply." };
    case "safety_restriction":
      return { kind: "safety", title: "Modalis restricted itself", body: s("message") || "A safety check paused something. Your money is unaffected." };
    case "plan_paused":
      return { kind: "info", title: "Plan paused", body: "Modalis won't make changes until you resume. You can still withdraw." };
    default:
      // goal_created / goal_updated / goal_reprioritised / plan_resumed are the person's own
      // actions — they appear in activity, but notifying someone of what they just did is noise.
      return null;
  }
}

export type Emit = {
  userId: string;
  type: DomainEventType;
  goalId?: string | null;
  payload?: Record<string, unknown>;
  txHash?: string | null;
};

export async function emit(db: ModalisClient | null | undefined, e: Emit): Promise<void> {
  if (!db) return;
  const payload = (e.payload ?? {}) as Json;
  const event = await recordEvent(db, { userId: e.userId, type: e.type, goalId: e.goalId, payload, txHash: e.txHash });
  const note = notificationFor(e.type, e.payload ?? {});
  if (event && note) {
    await createNotification(db, { userId: e.userId, eventId: event.id, ...note });
  }
}

/** `emit`, for a caller that knows the owner's address rather than their user id. */
export async function emitFor(
  ctx: { db?: ModalisClient | null },
  owner: string,
  e: Omit<Emit, "userId">,
): Promise<void> {
  if (!ctx.db) return;
  const user = await findUserByWallet(ctx.db, owner);
  if (user) await emit(ctx.db, { ...e, userId: user.id });
}

const MILESTONES = [25, 50, 75, 100] as const;

/**
 * Announces each goal milestone once. Called after money moves; reads the goal book, and for any
 * goal past a milestone it has not been told about, records it. Re-running is harmless: the
 * events already recorded are what stop a second announcement.
 */
export async function checkMilestones(
  ctx: Parameters<typeof goalBookFor>[0],
  owner: Parameters<typeof goalBookFor>[1],
): Promise<void> {
  if (!ctx.db) return;
  const user = await findUserByWallet(ctx.db, owner);
  if (!user) return;
  const { book } = await goalBookFor(ctx, owner);
  const past = await recentEvents(ctx.db, user.id, 200);
  const told = new Set(
    past
      .filter((e) => e.type === "goal_milestone")
      .map((e) => `${(e.payload as Record<string, unknown>)?.goalId}:${(e.payload as Record<string, unknown>)?.milestone}`),
  );
  for (const share of book.shares) {
    const pct = share.projection.percentComplete;
    const reached = MILESTONES.filter((m) => pct >= m);
    const top = reached[reached.length - 1];
    if (!top || told.has(`${share.goal.id}:${top}`)) continue;
    await emit(ctx.db, {
      userId: user.id,
      type: "goal_milestone",
      goalId: share.goal.id === "plan" ? null : share.goal.id,
      payload: {
        goalId: share.goal.id,
        milestone: top,
        title: top === 100 ? `${share.goal.name} is fully funded` : `${share.goal.name}: ${top}% of the way`,
        message: top === 100 ? "You've reached this goal's target." : `You've passed ${top}% of this goal.`,
      },
    });
  }
}
