/**
 * Adjustments, and the thing that makes Modalis safe to hand a plan to:
 *
 *   Modalis RECOMMENDS.  The person's RULES decide.  The CONTRACT enforces.
 *
 * Every adjustment is simulated against the live rules BEFORE the person is asked to approve
 * anything, so a refusal reaches them as "your rules stopped this" rather than as a failure after
 * the fact. These tests cover both answers — permitted and refused — and assert that a refusal
 * produces no action and an explanation a person can read.
 *
 * The refusal is encoded with the real PortfolioMandate error ABI, so the production decoder is
 * what reads it. Whether the Solidity actually refuses that case is proved where it has to be:
 * against a real EVM, in contracts/test/Modalis.t.sol and scripts/demo-local.sh.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendAdjustment, executeAdjustment, getPlanStatus } from "../src/services/adjustments.ts";
import { DomainError } from "../src/context.ts";
import { findLeakedJargon } from "../src/terms.ts";
import { fakeContext, noPlan, offPlan, onPlan, OWNER, type RuleRefusal } from "./fake-chain.ts";


test("a plan on target produces no adjustment at all", async () => {
  const adjustment = await recommendAdjustment(fakeContext(onPlan()), OWNER);
  assert.equal(adjustment.status, "none_needed");
  assert.equal(adjustment.allowedByYourRules, true);
  assert.equal(adjustment.change, undefined);
  assert.deepEqual(adjustment.reasons, []);
  assert.deepEqual(findLeakedJargon(adjustment.explanation), []);
});

test("a plan off target produces a recommendation its rules permit", async () => {
  const spec = offPlan();
  spec.rulesAnswer = "allows";
  const adjustment = await recommendAdjustment(fakeContext(spec), OWNER);

  assert.equal(adjustment.status, "recommended");
  assert.equal(adjustment.allowedByYourRules, true);
  assert.equal(adjustment.blockedBecause, undefined);

  // It says what would move, in the person's words and in whole investments.
  assert.ok(adjustment.change, "a recommendation should say what changes");
  assert.equal(adjustment.change.sell.name, "Bitcoin");
  assert.ok(Number(adjustment.change.sell.amount) > 0);
  assert.ok(adjustment.change.buy.name.length > 0);
  assert.ok(Number(adjustment.change.buy.atLeast) > 0);

  // And why, naming the rule rather than a code.
  assert.ok(adjustment.reasons.length > 0);
  const concentration = adjustment.reasons.find((r) => r.code === "too_much_in_one");
  assert.ok(concentration, "the reason should be the limit on one investment");
  assert.equal(concentration.limitPercent, 40);
  assert.ok(concentration.currentPercent > 40);
  assert.deepEqual(findLeakedJargon(concentration.message), []);
});

test("nothing is recommended before it has been checked against the rules", async () => {
  // The rules refuse this one. The person is told so BEFORE being asked to approve anything.
  const spec = offPlan();
  spec.rulesAnswer = "MAX_ALLOCATION_EXCEEDED";
  const adjustment = await recommendAdjustment(fakeContext(spec), OWNER);

  assert.equal(adjustment.status, "not_allowed");
  assert.equal(adjustment.allowedByYourRules, false);
  assert.equal(adjustment.blockedBecause, "your limit on how much can sit in one investment");
  assert.ok(adjustment.explanation.length > 20);
  assert.deepEqual(findLeakedJargon(adjustment.explanation), []);
  assert.deepEqual(findLeakedJargon(adjustment.blockedBecause), []);
});

test("each rule a refusal cites is named in the person's own words", async () => {
  const cases: [RuleRefusal, string][] = [
    ["MAX_ALLOCATION_EXCEEDED", "your limit on how much can sit in one investment"],
    ["MIN_LIQUIDITY_BREACHED", "the amount of money you keep available"],
    ["ALLOCATION_ABOVE_RANGE", "the range you approved for that investment"],
  ];
  for (const [errorName, expected] of cases) {
    const spec = offPlan();
    spec.rulesAnswer = errorName;
    const adjustment = await recommendAdjustment(fakeContext(spec), OWNER);
    assert.equal(adjustment.status, "not_allowed", errorName);
    assert.equal(adjustment.blockedBecause, expected, errorName);
  }
});

test("an adjustment cannot be carried out when the rules refuse it, and nothing moves", async () => {
  const spec = offPlan();
  spec.rulesAnswer = "MIN_LIQUIDITY_BREACHED";
  const ctx = fakeContext(spec);

  // A wallet that would fail loudly if anything tried to submit a transaction.
  const refuseToSign = {
    account: { address: OWNER },
    async writeContract() {
      throw new Error("nothing should be submitted when the rules refuse the change");
    },
  } as never;

  const result = await executeAdjustment(ctx, OWNER, refuseToSign);
  assert.equal(result.status, "not_allowed");
  assert.equal(result.allowedByYourRules, false);
  assert.equal(result.receipt, undefined, "a refused adjustment leaves no receipt");
  assert.equal(result.blockedBecause, "the amount of money you keep available");
});

test("there is nothing to carry out when the plan is already on target", async () => {
  const ctx = fakeContext(onPlan());
  await assert.rejects(
    () => executeAdjustment(ctx, OWNER, {} as never),
    (err: unknown) => err instanceof DomainError && err.code === "nothing_to_do" && err.status === 409,
  );
});

test("a transaction that fails is reported as nothing having moved", async () => {
  const spec = offPlan();
  spec.rulesAnswer = "allows";
  const ctx = fakeContext(spec);

  // Submission itself fails — the node rejects it, or it reverts after being mined.
  const failingWallet = {
    account: { address: "0x4000000000000000000000000000000000000001" },
    chain: undefined,
    async writeContract() {
      throw new Error("execution reverted: STALE_MANDATE_VERSION()");
    },
  } as never;

  const result = await executeAdjustment(ctx, OWNER, failingWallet);
  assert.equal(result.status, "failed");
  assert.equal(result.receipt, undefined, "a failed submission has no receipt to show");
  assert.match(result.explanation, /nothing moved|where it was/i);
  assert.deepEqual(findLeakedJargon(result.explanation), []);
});

test("an adjustment is refused outright for someone with no plan", async () => {
  const ctx = fakeContext(noPlan());
  await assert.rejects(
    () => recommendAdjustment(ctx, OWNER),
    (err: unknown) => err instanceof DomainError && err.code === "no_plan" && err.status === 404,
  );
});

test("the adjustment is derived from the chain, so a caller cannot choose the trade", async () => {
  // executeAdjustment takes only the account and a wallet. There is no parameter through which a
  // caller could pass a proposal, an amount, a token or a venue — which is the point.
  assert.equal(executeAdjustment.length, 3);
  assert.equal(recommendAdjustment.length, 2);
  assert.equal(getPlanStatus.length, 2);
});

