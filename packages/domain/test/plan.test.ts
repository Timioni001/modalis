/**
 * Plans, progress, and the state a plan is in.
 *
 * The thing worth protecting here is that a plan read back from the chain says the same thing in
 * the product's words that it says in the contract's numbers — and that a person who has not made
 * one is told so plainly instead of being shown an empty dashboard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getMoney } from "../src/services/money.ts";
import { getPlan, hasPlan, type GoalAnswers } from "../src/services/plans.ts";
import { getProgress } from "../src/services/progress.ts";
import { getPlanStatus } from "../src/services/adjustments.ts";
import { DomainError } from "../src/context.ts";
import { fakeContext, noPlan, offPlan, onPlan, OWNER, SOMEONE_ELSE } from "./fake-chain.ts";

export const ANSWERS: GoalAnswers = {
  goalKind: "house",
  targetAmount: 20_000,
  startingAmount: 10_000,
  contributionAmount: 200,
  contributionCadence: "monthly",
  monthsUntilNeeded: 60,
  ifItFellResponse: "do_nothing",
  comfortableLosingPercent: 15,
  moneyKeptAvailable: "some",
  incomeSteadiness: "stable",
};

test("a live plan reads back in the product's own words", async () => {
  const ctx = fakeContext(onPlan());
  const plan = await getPlan(ctx, OWNER);

  assert.equal(plan.status, "active");
  assert.equal(plan.version, 1);

  // Percentages are percentages. 15 means 15%, never 1500.
  assert.equal(plan.rules.comfortableLosingPercent, 15);
  assert.equal(plan.rules.moneyKeptAvailablePercent, 30);
  assert.equal(plan.rules.maxInOneInvestmentPercent, 40);
  assert.equal(plan.rules.adjustWhenOffTargetByPercent, 5);

  // Money is a decimal string with its currency, never a float.
  assert.equal(plan.goal.target.currency, "USD");
  assert.match(plan.goal.target.amount, /^\d+(\.\d+)?$/);

  // Investments are named, not coded.
  const names = plan.howMoneyIsSpread.map((h) => h.name).sort();
  assert.deepEqual(names, ["Bitcoin", "Cash", "Ethereum"]);

  const cash = plan.howMoneyIsSpread.find((h) => h.name === "Cash");
  assert.ok(cash);
  assert.equal(cash.sharePercent, 40);
  assert.equal(cash.allowedRange.minPercent, 30);
  assert.equal(cash.allowedRange.maxPercent, 50);
  assert.equal(cash.isAvailableCash, true);
});

test("the plan says whether Modalis is currently allowed to suggest adjustments", async () => {
  const allowed = await getPlan(fakeContext(onPlan()), OWNER);
  assert.equal(allowed.adjustmentsEnabled, true);

  const withdrawn = onPlan();
  withdrawn.manager = "0x0000000000000000000000000000000000000000";
  const notAllowed = await getPlan(fakeContext(withdrawn), OWNER);
  assert.equal(notAllowed.adjustmentsEnabled, false);
});

test("a paused plan reads as paused, not as missing", async () => {
  const spec = onPlan();
  spec.mandate!.active = false;
  const plan = await getPlan(fakeContext(spec), OWNER);
  assert.equal(plan.status, "paused");
});

test("someone with no plan is told so", async () => {
  const ctx = fakeContext(noPlan());
  assert.equal(await hasPlan(ctx, OWNER), false);
  await assert.rejects(
    () => getPlan(ctx, OWNER),
    (err: unknown) => err instanceof DomainError && err.code === "no_plan" && err.status === 404,
  );
});

test("a plan belongs to one account; another account's read finds nothing", async () => {
  const ctx = fakeContext(onPlan(), OWNER);
  assert.equal(await hasPlan(ctx, OWNER), true);
  assert.equal(await hasPlan(ctx, SOMEONE_ELSE), false);
});

test("the plan summary avoids protocol vocabulary", async () => {
  const plan = await getPlan(fakeContext(onPlan()), OWNER);
  assert.ok(plan.summary.length > 20, "a plan should explain itself in a sentence");
  const { findLeakedJargon } = await import("../src/terms.ts");
  assert.deepEqual(findLeakedJargon(plan.summary), []);
  for (const reason of plan.riskLevel.reasons) {
    assert.deepEqual(findLeakedJargon(reason), [], reason);
  }
});

test("progress is stated without ever promising a return", async () => {
  const ctx = fakeContext(onPlan());
  const progress = await getProgress(ctx, OWNER);

  assert.equal(progress.saved.amount, "10000.00");
  assert.equal(progress.target.amount, "20000.00");
  assert.equal(progress.percentComplete, 50);
  assert.equal(progress.remaining.amount, "10000.00");

  // The monthly figure assumes zero growth, which is the only honest one to state.
  const monthly = Number(progress.monthlyToStayOnTrack.amount);
  assert.ok(monthly > 0);
  assert.ok(
    Math.abs(monthly - 10_000 / progress.monthsRemaining) < 1,
    `expected the no-growth figure, got ${monthly} over ${progress.monthsRemaining} months`,
  );

  // Nothing in the wording may imply a projection.
  for (const word of ["projected", "expected return", "will grow", "guarantee", "APY"]) {
    assert.ok(
      !progress.summary.toLowerCase().includes(word.toLowerCase()),
      `progress should not say "${word}": ${progress.summary}`,
    );
  }
});

test("a plan on target reads as on plan", async () => {
  const status = await getPlanStatus(fakeContext(onPlan()), OWNER);
  assert.equal(status.health, "on_plan");
  assert.equal(status.needsAdjustment, false);
  assert.equal(status.availableMoneyPercent, 40);
  assert.equal(status.largestHoldingPercent, 40);
});

test("a plan that broke one of its own rules reads as off plan", async () => {
  const status = await getPlanStatus(fakeContext(offPlan()), OWNER);
  assert.equal(status.health, "off_plan");
  assert.equal(status.needsAdjustment, true);
  assert.ok(
    status.largestHoldingPercent > 40,
    `the largest holding should be past the 40% limit, got ${status.largestHoldingPercent}%`,
  );
  const { findLeakedJargon } = await import("../src/terms.ts");
  assert.deepEqual(findLeakedJargon(status.summary), []);
});

test("plan status is refused for someone with no plan", async () => {
  await assert.rejects(
    () => getPlanStatus(fakeContext(noPlan()), OWNER),
    (err: unknown) => err instanceof DomainError && err.code === "no_plan",
  );
});

test("a stale oracle cannot prevent reading the approved plan rules", async () => {
  const ctx = fakeContext(onPlan());
  const read = ctx.client.readContract.bind(ctx.client);
  ctx.client = { ...ctx.client, readContract: async (args: Parameters<typeof ctx.client.readContract>[0]) => {
    if (args.functionName === "value") throw new Error("PRICE_STALE");
    return read(args);
  } } as typeof ctx.client;
  const plan = await getPlan(ctx, OWNER);
  assert.equal(plan.version, 1);
  assert.equal(plan.howMoneyIsSpread.length, 3);
  await assert.rejects(() => getMoney(ctx, OWNER), /PRICE_STALE/);
});
