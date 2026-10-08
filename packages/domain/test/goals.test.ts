/**
 * Several goals over one portfolio: the priority waterfall (§5, §6).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateAcrossGoals, assignContribution, goalCards, inPriorityOrder, type GoalSpec } from "../src/goals.ts";
import { addGoal, getGoals } from "../src/services/goals.ts";
import { DomainError } from "../src/context.ts";
import { fakeContext, onPlan, noPlan, OWNER } from "./fake-chain.ts";

const E18 = 10n ** 18n;
const usd = (n: number) => BigInt(n) * E18;
const NOW = new Date("2026-01-01T00:00:00Z");

const goal = (id: string, priority: number, target: number, extra: Partial<GoalSpec> = {}): GoalSpec => ({
  id,
  name: id,
  kind: "custom",
  priority,
  targetE18: usd(target),
  targetDate: "2030-01-01",
  monthlyE18: usd(200),
  liquidityNeed: "some",
  createdAt: `2025-0${priority}-01T00:00:00Z`,
  ...extra,
});

test("the first priority is filled before the second receives anything", () => {
  const book = allocateAcrossGoals(usd(12_000), [goal("house", 2, 40_000), goal("safety", 1, 10_000)], NOW);
  const by = Object.fromEntries(book.shares.map((s) => [s.goal.id, s.earmarkedE18]));
  assert.equal(by.safety, usd(10_000));
  assert.equal(by.house, usd(2_000));
  assert.equal(book.surplusE18, 0n);
});

test("money beyond every target is surplus, never quietly credited to a goal", () => {
  const book = allocateAcrossGoals(usd(15_000), [goal("a", 1, 10_000), goal("b", 2, 3_000)], NOW);
  assert.equal(book.surplusE18, usd(2_000));
  const total = book.shares.reduce((s, x) => s + x.earmarkedE18, 0n) + book.surplusE18;
  assert.equal(total, usd(15_000), "every dollar is accounted for exactly once");
});

test("equal priorities fall back to the older goal, so the order is always deterministic", () => {
  const order = inPriorityOrder([
    goal("newer", 1, 1, { createdAt: "2025-06-01T00:00:00Z" }),
    goal("older", 1, 1, { createdAt: "2025-01-01T00:00:00Z" }),
  ]);
  assert.deepEqual(order.map((g) => g.id), ["older", "newer"]);
});

test("new money goes to the first goal still short, then overflows to the next", () => {
  const book = allocateAcrossGoals(usd(9_500), [goal("safety", 1, 10_000), goal("house", 2, 40_000)], NOW);
  const where = assignContribution(book, usd(1_000));
  assert.deepEqual(where.map((w) => [w.goalId, w.amountE18]), [["safety", usd(500)], ["house", usd(500)]]);
});

test("once every goal is full, new money is reported as beyond every goal", () => {
  const book = allocateAcrossGoals(usd(10_000), [goal("safety", 1, 10_000)], NOW);
  const where = assignContribution(book, usd(250));
  assert.deepEqual(where, [{ goalId: null, name: "Not assigned to a goal", amountE18: usd(250) }]);
});

test("a goal with nothing yet says which goal is ahead of it", () => {
  const book = allocateAcrossGoals(usd(4_000), [goal("Safety net", 1, 10_000), goal("House", 2, 40_000)], NOW);
  const cards = goalCards(book);
  assert.match(cards[1].summary, /Waiting: safety net is funded first/);
  assert.equal(cards[1].saved.amount, "0.00");
});

test("each goal is projected on its own share and its own contribution", () => {
  const book = allocateAcrossGoals(usd(10_000), [goal("a", 1, 10_000), goal("b", 2, 20_000, { monthlyE18: 0n })], NOW);
  const cards = goalCards(book);
  assert.equal(cards[0].summary, "Fully funded.");
  assert.match(cards[1].summary, /Add a monthly amount/);
});

test("without a database the plan's own goal is shown, from the chain alone", async () => {
  const view = await getGoals(fakeContext(onPlan()), OWNER, NOW);
  assert.equal(view.goals.length, 1);
  assert.equal(view.canManage, false);
  assert.equal(view.goals[0].saved.amount, "10000.00");
});

test("adding a goal without a database says so plainly", async () => {
  await assert.rejects(
    addGoal(fakeContext(onPlan()), OWNER, {
      kind: "travel", name: "Japan", targetValue: 5000, targetDate: "2028-01-01",
      contributionAmount: 100, contributionCadence: "monthly", liquidityNeed: "some",
    }, NOW),
    (e: unknown) => e instanceof DomainError && e.code === "no_database",
  );
});

test("goals need a plan first", async () => {
  await assert.rejects(getGoals(fakeContext(noPlan()), OWNER, NOW), (e: unknown) => e instanceof DomainError && e.code === "no_plan");
});
