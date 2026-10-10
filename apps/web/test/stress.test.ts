import { test } from "node:test";
import assert from "node:assert/strict";
import { stressTest } from "../lib/stress.ts";

const E = 10n ** 18n;
const positions = [
  { symbol: "mUSD", isLiquid: true, valueE18: 2_000n * E, minBps: 1_500, maxBps: 3_000 },
  { symbol: "mBTC", isLiquid: false, valueE18: 5_000n * E, minBps: 4_000, maxBps: 6_000 },
  { symbol: "mETH", isLiquid: false, valueE18: 3_000n * E, minBps: 2_000, maxBps: 4_000 },
];

test("cash doesn't fall; everything else falls by the chosen amount", () => {
  const r = stressTest(positions, { maxDrawdownBps: 2_000, minLiquidityBps: 1_000 }, 3_000);
  assert.equal(r.beforeE18, 10_000n * E);
  assert.equal(r.afterE18, 2_000n * E + 3_500n * E + 2_100n * E);
  assert.equal(r.planFallBps, 2_400, "a 30% drop on 80% of the money is a 24% fall");
  assert.equal(r.pastDrawdownLimit, true);
});

test("cash grows as a share after a drop, which can push it past its range", () => {
  const r = stressTest(positions, { maxDrawdownBps: 3_000, minLiquidityBps: 1_000 }, 3_000);
  assert.equal(r.pastDrawdownLimit, false);
  assert.ok(r.liquidityAfterBps > 2_600);
  assert.deepEqual(r.outsideRange.map((p) => p.symbol), []);
  const big = stressTest(positions, { maxDrawdownBps: 9_000, minLiquidityBps: 1_000 }, 5_000);
  assert.deepEqual(big.outsideRange.map((p) => p.symbol), ["mUSD"]);
});

test("no money means no fall", () => {
  const r = stressTest([], { maxDrawdownBps: 1_000, minLiquidityBps: 1_000 }, 3_000);
  assert.equal(r.planFallBps, 0);
});
