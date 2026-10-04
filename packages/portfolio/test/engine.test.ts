import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessRisk,
  checkMandate,
  contributionGapMonthly,
  driftBps,
  goalProgress,
  planRebalance,
  routeContribution,
  total,
  usdToUnits,
  weightsBps,
  type Allocation,
  type MandateRules,
} from "../src/index.ts";

const E18 = 10n ** 18n;
const usd = (n: number) => BigInt(Math.round(n * 1_000_000)) * 10n ** 12n;

// Same mandate as contracts/test/Modalis.t.sol
const rules: MandateRules = {
  maxSingleAssetBps: 4000,
  minLiquidityBps: 1000,
  rebalanceThresholdBps: 500,
  maxSlippageBps: 200,
  maxDrawdownBps: 1500,
  targetValue: 20_000n * E18,
  targetDate: 2_000_000_000,
};
const allocs: Allocation[] = [
  { token: "mBTC", symbol: "mBTC", targetBps: 3500, minBps: 3000, maxBps: 4000, isLiquid: false, assetMaxBps: 5000 },
  { token: "mETH", symbol: "mETH", targetBps: 3000, minBps: 2500, maxBps: 3500, isLiquid: false, assetMaxBps: 5000 },
  { token: "mBOND", symbol: "mBOND", targetBps: 2500, minBps: 2000, maxBps: 3000, isLiquid: false, assetMaxBps: 5000 },
  { token: "mUSD", symbol: "mUSD", targetBps: 1000, minBps: 1000, maxBps: 2000, isLiquid: true, assetMaxBps: 10_000 },
];

const atTarget = [usd(3500), usd(3000), usd(2500), usd(1000)];
const afterRally = [usd(4900), usd(3000), usd(2500), usd(1000)]; // BTC $50k -> $70k

test("at target: OK, zero drift, no plan", () => {
  assert.deepEqual(weightsBps(atTarget), [3500, 3000, 2500, 1000]);
  assert.deepEqual(driftBps(allocs, atTarget), [0, 0, 0, 0]);
  const r = assessRisk(rules, allocs, atTarget);
  assert.equal(r.status, "OK");
  assert.equal(planRebalance(rules, allocs, atTarget), null);
});

test("rally: BREACH on single-asset cap AND liquidity floor", () => {
  const r = assessRisk(rules, allocs, afterRally);
  assert.equal(r.status, "BREACH");
  const codes = r.violations.map((v) => v.code);
  assert.ok(codes.includes("MAX_ALLOCATION_EXCEEDED"));
  assert.ok(codes.includes("MIN_LIQUIDITY_BREACHED"));
  assert.equal(r.largestPositionBps, 4298);
});

test("planner: finds smallest single swap that restores compliance (BTC -> mUSD)", () => {
  const plan = planRebalance(rules, allocs, afterRally);
  assert.ok(plan);
  assert.equal(plan.sellToken, "mBTC");
  assert.equal(plan.buyToken, "mUSD"); // buying ETH/BOND cannot fix liquidity, so USD is the only valid buy
  assert.ok(plan.usdAmount >= usd(340) && plan.usdAmount <= usd(1280));
  assert.match(plan.reason, /above the 40\.0% limit/);
  assert.match(plan.reason, /liquidity reserve/);

  // Post-trade state must pass the same check the contract runs.
  const i = allocs.findIndex((a) => a.token === plan.sellToken);
  const j = allocs.findIndex((a) => a.token === plan.buyToken);
  const next = afterRally.slice();
  next[i] -= plan.usdAmount;
  next[j] += plan.usdAmount;
  assert.deepEqual(checkMandate(rules, allocs, next), []);
});

test("the demo's invalid action is rejected by the mirror check (BTC 55% vs 40% cap)", () => {
  // $2,000 of BOND -> BTC
  const bad = [usd(5500), usd(3000), usd(500), usd(1000)];
  const v = checkMandate(rules, allocs, bad);
  assert.equal(v[0].code, "MAX_ALLOCATION_EXCEEDED");
  assert.equal(v[0].token, "mBTC");
  assert.equal(v[0].bps, 5500);
  assert.equal(v[0].limitBps, 4000);
});

test("pure drift above threshold (no hard breach) -> DRIFT", () => {
  // BTC 39.5%, ETH 27.5%, BOND 23%, USD 10% -> BTC 400 bps over target; threshold 500 => try bigger
  const drifted = [usd(3950), usd(2500), usd(2550), usd(1000)];
  const r = assessRisk({ ...rules, rebalanceThresholdBps: 300 }, allocs, drifted);
  assert.equal(r.status, "DRIFT");
  assert.equal(r.violations.length, 0);
});

test("empty portfolio cannot breach", () => {
  assert.deepEqual(checkMandate(rules, allocs, [0n, 0n, 0n, 0n]), []);
  assert.equal(assessRisk(rules, allocs, [0n, 0n, 0n, 0n]).status, "OK");
});

test("contribution routes to underweight positions without selling", () => {
  // After rally, BTC is overweight; a $1,140 contribution should avoid BTC entirely.
  const split = routeContribution(allocs, afterRally, usd(1140));
  assert.equal(split[0], 0n); // BTC gets nothing
  assert.equal(total(split.map((x) => x)), usd(1140)); // fully allocated, dust included
  assert.ok(split[1] > 0n && split[2] > 0n && split[3] > 0n);
});

test("goal progress and zero-growth contribution gap", () => {
  assert.equal(goalProgress(2_840n * E18, 20_000n * E18), 0.142);
  const g = contributionGapMonthly(2_000n * E18, 20_000n * E18, 60, 200n * E18);
  assert.equal(g.requiredMonthly, 300n * E18);
  assert.equal(g.gapMonthly, 100n * E18);
});

test("usdToUnits respects token decimals", () => {
  assert.equal(usdToUnits(1_000n * E18, 50_000n * E18, 8), 2_000_000n); // $1,000 of $50k BTC = 0.02 BTC
  assert.equal(usdToUnits(1_000n * E18, 1n * E18, 6), 1_000_000_000n); // $1,000 of mUSD
});
