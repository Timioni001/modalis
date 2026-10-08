import { test } from "node:test";
import assert from "node:assert/strict";
import { STRATEGIES, strategyFor, validateStrategies, type Strategy } from "../src/strategies.ts";
import { maxSingleAssetBpsFor, rebalanceThresholdBpsFor, growthCeilingBps } from "../src/allocation.ts";

test("the registry is sound: contiguous, in range, concentration never falls as risk rises", () => {
  assert.deepEqual(validateStrategies(), []);
});

test("every score from 0 to 100 has exactly one strategy", () => {
  for (let s = 0; s <= 100; s++) assert.ok(strategyFor(s));
});

test("the registry reproduces the planner's previous limits exactly", () => {
  // The bands the planner hard-coded before the registry existed.
  const old = (r: number) => (r < 20 ? 1500 : r < 35 ? 2000 : r < 65 ? 3000 : 4000);
  const oldBand = (r: number) => (r >= 65 ? 500 : r >= 35 ? 400 : 300);
  for (let r = 0; r <= 100; r++) {
    assert.equal(maxSingleAssetBpsFor(r), old(r), `score ${r}`);
    assert.equal(rebalanceThresholdBpsFor(r), oldBand(r), `score ${r}`);
  }
  const oldGrowth = (h: number) => (h >= 60 ? 7000 : h >= 36 ? 6000 : h >= 24 ? 4500 : h >= 12 ? 3000 : 1500);
  for (const h of [0, 6, 12, 23, 24, 36, 59, 60, 240]) assert.equal(growthCeilingBps(h), oldGrowth(h), `horizon ${h}`);
});

test("a broken registry is caught: a gap, and a riskier strategy allowing less concentration", () => {
  const broken: Strategy[] = STRATEGIES.map((s) => ({ ...s }));
  broken[1].scoreFrom = 22;
  broken[3].maxSingleAssetBps = 1_000;
  const problems = validateStrategies(broken);
  assert.ok(problems.some((p) => /Gap or overlap/.test(p)));
  assert.ok(problems.some((p) => /less concentration/.test(p)));
});
