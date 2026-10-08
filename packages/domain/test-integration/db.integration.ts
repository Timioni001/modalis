/**
 * The database path, end to end, against REAL Postgres through REAL PostgREST.
 *
 * Unit tests run without a database. This proves the 0002 features actually work when one is
 * configured: goals and the waterfall, plan history, events and notifications (including their
 * idempotency), milestones, automation and its timelock, and owner scoping on every write.
 *
 *   bash scripts/db-integration.sh          # starts Postgres + PostgREST, runs this, stops them
 *
 * Skipped (not failed) when MODALIS_IT_URL / MODALIS_IT_SERVICE_KEY are absent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGoal, recentEvents, recordMandate, serverClient, upsertUser, resetClientCache } from "@modalis/db";
import { addGoal, editGoal, getGoals, reorderGoals } from "../src/services/goals.ts";
import { emit, checkMilestones } from "../src/services/events.ts";
import { getNotifications, readNotifications } from "../src/services/notifications.ts";
import { automationFor, setAutomation } from "../src/services/automation.ts";
import { getPlanHistory } from "../src/services/history.ts";
import { getGoal } from "../src/services/goal.ts";
import { DomainError } from "../src/context.ts";
import { fakeContext, onPlan, OWNER, SOMEONE_ELSE, TOKENS } from "../test/fake-chain.ts";

const url = process.env.MODALIS_IT_URL;
const key = process.env.MODALIS_IT_SERVICE_KEY;
const skip = !url || !key ? "no integration database configured" : false;

const NOW = new Date();
const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

function ctxWithDb() {
  resetClientCache();
  const db = serverClient({ url, serviceRoleKey: key });
  assert.ok(db, "client");
  return { ...fakeContext(onPlan()), db };
}

async function approvePlan(ctx: ReturnType<typeof ctxWithDb>, version: number, minLiquidityBps: number, goalId?: string) {
  const user = (await upsertUser(ctx.db!, { walletAddress: OWNER, chainId: 10143 }))!;
  const goal =
    goalId ??
    (await createGoal(ctx.db!, {
      userId: user.id, type: "house", name: "A home", targetValue: 20000, targetDate: "2031-01-01",
      initialAmount: 0, contributionAmount: 300, contributionCadence: "monthly", priority: 1,
    }))!.id;
  await recordMandate(ctx.db!, {
    userId: user.id, goalId: goal, contractAddress: "0x00000000000000000000000000000000000000c1",
    version, targetValue: "20000", targetDate: "2031-01-01T00:00:00Z",
    maxDrawdownBps: 1500, minLiquidityBps, maxAssetBps: 4000, rebalanceThresholdBps: 500, maxSlippageBps: 200,
    reason: version === 1 ? "You approved your first plan." : "You changed your plan.",
    allocations: [{ tokenAddress: TOKENS.mUSD, symbol: "mUSD", targetBps: 4000, minBps: 3000, maxBps: 5000, isLiquid: true }],
  });
  return { user, goalId: goal };
}

test("goals, the waterfall, ownership, events, notifications, automation and history — for real", { skip }, async () => {
  const ctx = ctxWithDb();
  const { user, goalId: planGoal } = await approvePlan(ctx, 1, 3000);

  // The plan's goal is shown, with the chain's target and the whole $10,000 portfolio.
  let view = await getGoals(ctx, OWNER, NOW);
  assert.equal(view.planGoalId, planGoal);
  assert.equal(view.goals.length, 1);
  assert.equal(view.goals[0].saved.amount, "10000.00");

  // A second goal joins the back of the queue and receives nothing while the first is short.
  view = await addGoal(ctx, OWNER, {
    kind: "travel", name: "Japan", targetValue: 5000, targetDate: "2028-06-01",
    contributionAmount: 100, contributionCadence: "monthly", liquidityNeed: "some",
  }, NOW);
  const japan = view.goals.find((g) => g.name === "Japan")!;
  assert.equal(view.goals.length, 2);
  assert.equal(japan.priority, 2);
  assert.equal(japan.saved.amount, "0.00");
  assert.match(japan.summary, /Waiting/);

  // Moving Japan first funds it first.
  view = await reorderGoals(ctx, OWNER, [japan.id, planGoal], NOW);
  assert.equal(view.goals[0].name, "Japan");
  assert.equal(view.goals[0].saved.amount, "5000.00");
  assert.equal(view.goals[1].saved.amount, "5000.00");

  // The single-goal view follows the PLAN's goal, at its share — not the newest goal, not all of it.
  const single = await getGoal(ctx, OWNER, NOW);
  assert.equal(single.goal.id, planGoal);
  assert.equal(single.saved.amount, "5000.00");

  // The plan's goal cannot have its enforced target edited from the database.
  await assert.rejects(editGoal(ctx, OWNER, planGoal, { targetValue: 1 }, NOW), (e: unknown) => e instanceof DomainError && e.code === "plan_goal_locked");

  // Someone else cannot touch these goals, by id or by order.
  await assert.rejects(editGoal(ctx, SOMEONE_ELSE, japan.id, { name: "mine now" }, NOW), (e: unknown) => e instanceof DomainError && e.code === "not_found");
  await assert.rejects(reorderGoals(ctx, SOMEONE_ELSE, [japan.id], NOW), (e: unknown) => e instanceof DomainError && e.code === "bad_order");
  await assert.rejects(reorderGoals(ctx, OWNER, [japan.id], NOW), (e: unknown) => e instanceof DomainError && e.code === "bad_order", "a partial order is refused");

  // Own actions are events, but not notifications.
  let events = await recentEvents(ctx.db!, user.id);
  for (const t of ["goal_created", "goal_reprioritised"]) assert.ok(events.some((e) => e.type === t), t);
  assert.equal((await getNotifications(ctx, OWNER)).notifications.length, 0);

  // A transaction-backed event is recorded once, however many times it is reported.
  await emit(ctx.db, { userId: user.id, type: "money_added", txHash: TX(1), payload: { amount: "$500" } });
  await emit(ctx.db, { userId: user.id, type: "money_added", txHash: TX(1), payload: { amount: "$500" } });
  events = await recentEvents(ctx.db!, user.id);
  assert.equal(events.filter((e) => e.type === "money_added").length, 1);
  let notes = await getNotifications(ctx, OWNER);
  assert.equal(notes.unread, 1);
  assert.equal(notes.notifications[0].body, "$500 is in your plan.");

  // Reading someone else's notification ids marks nothing; reading your own clears them.
  assert.equal(await readNotifications(ctx, SOMEONE_ELSE, notes.notifications.map((n) => n.id)), 0);
  assert.equal(await readNotifications(ctx, OWNER, notes.notifications.map((n) => n.id)), 1);
  notes = await getNotifications(ctx, OWNER);
  assert.equal(notes.unread, 0);

  // Milestones are announced once.
  await checkMilestones(ctx, OWNER);
  await checkMilestones(ctx, OWNER);
  events = await recentEvents(ctx.db!, user.id);
  const milestones = events.filter((e) => e.type === "goal_milestone");
  assert.ok(milestones.length >= 1);
  const keys = milestones.map((e) => JSON.stringify(e.payload));
  assert.equal(new Set(keys).size, keys.length, "no milestone announced twice");

  // Automation: a raise waits, then lands once; a lowering is immediate.
  let auto = await setAutomation(ctx, OWNER, "automated", NOW);
  assert.equal(auto.level, "assisted");
  assert.equal(auto.requestedLevel, "automated");
  assert.equal((await automationFor(ctx, OWNER, NOW)).level, "assisted");
  const tomorrow = new Date(NOW.getTime() + 25 * 3600_000);
  assert.equal((await automationFor(ctx, OWNER, tomorrow)).level, "automated");
  await automationFor(ctx, OWNER, tomorrow);
  events = await recentEvents(ctx.db!, user.id);
  assert.equal(events.filter((e) => e.type === "automation_effective").length, 1, "announced once");
  auto = await setAutomation(ctx, OWNER, "guided", tomorrow);
  assert.deepEqual([auto.level, auto.requestedLevel], ["guided", null]);

  // Plan history: two versions, the second says why and what changed, in words.
  await approvePlan(ctx, 2, 4000, planGoal);
  const history = await getPlanHistory(ctx, OWNER);
  assert.deepEqual(history.versions.map((v) => v.version), [2, 1]);
  assert.equal(history.versions[0].reason, "You changed your plan.");
  assert.deepEqual(history.versions[0].changes, [{ label: "Kept available", from: "30%", to: "40%" }]);
});
