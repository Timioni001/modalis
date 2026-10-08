/**
 * The contribution router: new money should reduce drift, never carry it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeContribution } from "../src/contributions.ts";
import { buildFundingPlan } from "../src/services/money.ts";
import { fakeContext, offPlan, onPlan, OWNER, TOKENS } from "./fake-chain.ts";

const E18 = 10n ** 18n;
const usd = (n: number) => BigInt(n) * E18;
const sum = (xs: { amountE18: bigint }[]) => xs.reduce((a, x) => a + x.amountE18, 0n);

test("an empty plan gets the plain target split", () => {
  const r = routeContribution(
    [
      { id: "cash", valueE18: 0n, targetBps: 4_000 },
      { id: "btc", valueE18: 0n, targetBps: 3_500 },
      { id: "eth", valueE18: 0n, targetBps: 2_500 },
    ],
    usd(1_000),
  );
  assert.deepEqual(r.map((x) => x.amountE18), [usd(400), usd(350), usd(250)]);
});

test("an overweight holding gets nothing while others are below target", () => {
  // Bitcoin ran: $7,000 of $13,500 is ~52% against a 35% target.
  const r = routeContribution(
    [
      { id: "cash", valueE18: usd(4_000), targetBps: 4_000 },
      { id: "btc", valueE18: usd(7_000), targetBps: 3_500 },
      { id: "eth", valueE18: usd(2_500), targetBps: 2_500 },
    ],
    usd(1_000),
  );
  const by = Object.fromEntries(r.map((x) => [x.id, x.amountE18]));
  assert.equal(by.btc, 0n);
  // Gaps after the contribution are $1,800 (cash) and $1,125 (eth): shared in that ratio.
  assert.ok(by.cash > by.eth);
  assert.equal(sum(r), usd(1_000));
});

test("money beyond every gap is split by target, and the total is always exact", () => {
  const r = routeContribution(
    [
      { id: "a", valueE18: usd(100), targetBps: 5_000 },
      { id: "b", valueE18: usd(0), targetBps: 5_000 },
    ],
    usd(1_000) + 7n, // a few wei of dust on purpose
  );
  assert.equal(sum(r), usd(1_000) + 7n);
  // After: $1,100 → $550 each. a needs $450, b needs $550: exactly the contribution.
  const [a, b] = r.map((x) => x.amountE18);
  assert.ok(b > a);
});

test("every route moves the portfolio closer to its targets, never further", () => {
  const holdings = [
    { id: "cash", valueE18: usd(4_000), targetBps: 4_000 },
    { id: "btc", valueE18: usd(7_000), targetBps: 3_500 },
    { id: "eth", valueE18: usd(2_500), targetBps: 2_500 },
  ];
  const drift = (values: bigint[]) => {
    const total = values.reduce((a, b) => a + b, 0n);
    return values.reduce((worst, v, i) => {
      const d = Number((v * 10_000n) / total) - holdings[i].targetBps;
      return Math.max(worst, Math.abs(d));
    }, 0);
  };
  const before = drift(holdings.map((h) => h.valueE18));
  const routed = routeContribution(holdings, usd(1_000));
  const naive = holdings.map((h) => h.valueE18 + (usd(1_000) * BigInt(h.targetBps)) / 10_000n);
  const smart = holdings.map((h, i) => h.valueE18 + routed[i].amountE18);
  assert.ok(drift(smart) < before);
  assert.ok(drift(smart) < drift(naive), "routing must beat the naive split");
});

test("the funding plan buys none of what is already over target", async () => {
  const funding = await buildFundingPlan(fakeContext(offPlan()), OWNER, { amount: "1000" });
  assert.ok(!funding.steps.some((s) => s.holdingId === TOKENS.mBTC), "no Bitcoin should be bought");
  assert.ok(funding.steps.some((s) => s.holdingId === TOKENS.mUSD));
});

test("an on-plan portfolio funds exactly as before", async () => {
  const funding = await buildFundingPlan(fakeContext(onPlan()), OWNER, { amount: "1000" });
  const adds = funding.steps.filter((s) => s.kind === "add").map((s) => s.value.amount);
  assert.deepEqual(adds, ["400.00", "350.00", "250.00"]);
});
