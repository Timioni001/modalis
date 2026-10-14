import assert from "node:assert/strict";
import test from "node:test";
import { compareTwins, simulateTwin, type TwinScenarioInput } from "../src/twin.ts";

const base: TwinScenarioInput = {
  startingE18: 10_000n * 10n ** 18n,
  targetE18: 30_000n * 10n ** 18n,
  monthsRemaining: 60,
  monthlyContributionE18: 250n * 10n ** 18n,
  withdrawalE18: 0n,
  risk: "balanced",
};

test("Twin is deterministic and reports fixed path confidence", () => {
  const first = simulateTwin(base);
  const second = simulateTwin(base);
  assert.equal(first.expectedE18, second.expectedE18);
  assert.equal(first.downsideE18, second.downsideE18);
  assert.equal(first.confidencePct, 25);
  assert.equal(first.assumptions.some((line) => line.includes("not a market forecast")), true);
});

test("an invalid withdrawal is rejected before any state can change", () => {
  const before = { ...base };
  assert.throws(() => simulateTwin({ ...base, withdrawalE18: base.startingE18 + 1n }), /larger than your current balance/);
  assert.deepEqual(base, before);
});

test("comparison keeps the live future unchanged and exposes deltas", () => {
  const alternative = { ...base, monthsRemaining: 36, monthlyContributionE18: 500n * 10n ** 18n };
  const result = compareTwins(base, alternative);
  assert.equal(result.base.input.monthsRemaining, 60);
  assert.equal(result.alternative.input.monthsRemaining, 36);
  assert.ok(result.alternative.requiredMonthlyE18 > 0n);
  assert.ok(result.expectedDeltaE18 !== 0n);
});
