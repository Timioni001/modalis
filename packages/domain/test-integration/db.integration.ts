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
import { createGoal, recentEvents, recordMandate, serverClient, upsertUser, updateGoal, resetClientCache } from "@modalis/db";
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

test("saved plan metadata preserves weekly contributions without changing chain targets", { skip }, async () => {
  const ctx = ctxWithDb();
  const user = (await upsertUser(ctx.db!, { walletAddress: OWNER, chainId: 10143 }))!;
  const goal = (await createGoal(ctx.db!, { userId: user.id, type: "house", name: "My first home", targetValue: 99999,
    targetDate: "2031-01-01", initialAmount: 10, contributionAmount: 300, contributionCadence: "weekly", priority: 1 }))!;
  await recordMandate(ctx.db!, { userId: user.id, goalId: goal.id, contractAddress: "0x00000000000000000000000000000000000000c1",
    version: 3, targetValue: "20000", targetDate: "2031-01-01T00:00:00Z", maxDrawdownBps: 1500,
    minLiquidityBps: 3000, maxAssetBps: 4000, rebalanceThresholdBps: 500, maxSlippageBps: 150, allocations: [] });
  const { getPlan } = await import("../src/services/plans.ts");
  const plan = await getPlan(ctx, OWNER);
  assert.equal(plan.goal.name, "My first home");
  assert.equal(plan.goal.startingAmount.amount, "10");
  assert.equal(plan.goal.contribution.amount.amount, "1300");
  assert.equal(plan.goal.target.amount, "20000");
});

test("custom savings survive reload, enforce the whole-contribution minimum, warn on early retrieval, and remain owner-scoped", { skip }, async () => {
  const ctx = ctxWithDb();
  const { user, goalId } = await approvePlan(ctx, 4, 3000);
  const startedAt = NOW.toISOString();
  const savings = { minimumContribution: "10.10", minimumRetrievalDays: 30, customDetails: "Tuition first.", startedAt };
  assert.ok(await updateGoal(ctx.db!, user.id, goalId, { savingsPreferences: savings }));
  const { getPlan } = await import("../src/services/plans.ts");
  const { buildFundingPlan } = await import("../src/services/money.ts");
  const { buildWithdrawalPlan } = await import("../src/services/withdraw.ts");
  assert.deepEqual((await getPlan(ctx, OWNER)).goal.savings, savings);
  assert.deepEqual((await getGoal(ctx, OWNER)).goal.savings, savings);
  await assert.rejects(buildFundingPlan(ctx, OWNER, { amount: "10.09" }), (e: unknown) => e instanceof DomainError && e.code === "below_minimum_contribution");
  const funding = await buildFundingPlan(ctx, OWNER, { amount: "10.10" });
  assert.equal(funding.total.amount, "10.10");
  assert.ok(funding.steps.some((step) => Number(step.value.amount) < 10.1), "per-asset transfers may be below the complete-contribution minimum");
  const early = await buildWithdrawalPlan(ctx, OWNER, { amount: "5" }, NOW);
  assert.ok(early.steps.length > 0, "the personal reminder does not lock the owner out");
  assert.ok(early.consequences.some((line) => line.includes("personal reminder")));
  const onTime = await buildWithdrawalPlan(ctx, OWNER, { amount: "5" }, new Date(NOW.getTime() + 30 * 86400000));
  assert.ok(!onTime.consequences.some((line) => line.includes("personal reminder")), "the boundary is inclusive");
  const other = (await upsertUser(ctx.db!, { walletAddress: SOMEONE_ELSE, chainId: 10143 }))!;
  assert.equal(await updateGoal(ctx.db!, other.id, goalId, { savingsPreferences: { ...savings, minimumContribution: "0.00" } }), null);
  assert.deepEqual((await getPlan(ctx, OWNER)).goal.savings, savings);
  for (const malformed of [
    {}, { ...savings, minimumContribution: "100000.01" }, { ...savings, minimumRetrievalDays: 0.5 },
    { ...savings, minimumRetrievalDays: 3651 }, { ...savings, customDetails: "a".repeat(501) },
  ]) {
    const result = await ctx.db!.from("goals").update({ savings_preferences: malformed as typeof savings }).eq("id", goalId);
    assert.ok(result.error, "the database also refuses invalid settings");
  }
});
