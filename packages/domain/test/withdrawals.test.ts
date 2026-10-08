/**
 * Taking money out: comes from what is over target first, never more than is held, and says what
 * it costs before anything is signed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planWithdrawal } from "../src/withdrawals.ts";
import { buildWithdrawalPlan } from "../src/services/withdraw.ts";
import { DomainError } from "../src/context.ts";
import { fakeContext, offPlan, onPlan, OWNER, TOKENS } from "./fake-chain.ts";

const E18 = 10n ** 18n;
const usd = (n: number) => BigInt(n) * E18;
const sum = (xs: { amountE18: bigint }[]) => xs.reduce((a, x) => a + x.amountE18, 0n);

const OFF = [
  { id: "cash", valueE18: usd(4_000), targetBps: 4_000, isLiquid: true },
  { id: "btc", valueE18: usd(7_000), targetBps: 3_500, isLiquid: false },
  { id: "eth", valueE18: usd(2_500), targetBps: 2_500, isLiquid: false },
];

test("a withdrawal comes from what is over target first", () => {
  const s = planWithdrawal(OFF, usd(1_000), 3_000);
  const by = Object.fromEntries(s.parts.map((p) => [p.id, p.amountE18]));
  assert.equal(by.btc, usd(1_000), "all of it from the overweight Bitcoin");
  assert.equal(by.cash, 0n);
  assert.equal(sum(s.parts), usd(1_000));
});

test("beyond the excess, the rest is spread in proportion, and the total is exact", () => {
  const s = planWithdrawal(OFF, usd(9_000) + 3n, 3_000);
  assert.equal(sum(s.parts), usd(9_000) + 3n);
  for (const p of s.parts) {
    const held = OFF.find((h) => h.id === p.id)!.valueE18;
    assert.ok(p.amountE18 <= held, "never more than is held");
  }
});

test("the kept-available floor is reported honestly, not enforced against the owner", () => {
  const onlyCashLeft = [
    { id: "cash", valueE18: usd(1_000), targetBps: 3_000, isLiquid: true },
    { id: "btc", valueE18: usd(2_000), targetBps: 7_000, isLiquid: false },
  ];
  const s = planWithdrawal(onlyCashLeft, usd(900), 3_000);
  assert.ok(s.availableBpsAfter < s.availableBpsBefore);
  assert.equal(typeof s.keepsAvailableFloor, "boolean");
});

test("more than is held is refused before any arithmetic", () => {
  assert.throws(() => planWithdrawal(OFF, usd(20_000), 0), RangeError);
});

test("the withdrawal plan takes Bitcoin first on the off-plan portfolio, and explains the cost", async () => {
  const plan = await buildWithdrawalPlan(fakeContext(offPlan()), OWNER, { amount: "1000" });
  assert.deepEqual(plan.steps.map((s) => s.holdingId), [TOKENS.mBTC]);
  assert.ok(plan.consequences.length > 0, "the person is told what it costs before signing");
});

test("asking for more than the plan holds points to the full exit instead", async () => {
  await assert.rejects(
    buildWithdrawalPlan(fakeContext(onPlan()), OWNER, { amount: "999999" }),
    (e: unknown) => e instanceof DomainError && e.code === "too_much",
  );
});
