/**
 * The funding flow, and what it refuses.
 *
 * What is being asserted is the product promise: whatever a person adds is split the way THEIR
 * PLAN says, so the money lands on plan instead of needing an adjustment straight away. And that
 * the screen can warn them before they sign anything, rather than after a transaction fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFundingPlan, getMoney, getWalletBalances } from "../src/services/money.ts";
import { DomainError } from "../src/context.ts";
import { fakeContext, noPlan, offPlan, onPlan, OWNER, SOMEONE_ELSE, TOKENS } from "./fake-chain.ts";

test("adding money splits it the way the plan says", async () => {
  const ctx = fakeContext(onPlan());
  const funding = await buildFundingPlan(ctx, OWNER, { amount: "1000" });

  assert.equal(funding.total.amount, "1000.00");

  // 40 / 35 / 25 of $1,000, by the plan's own targets.
  const byHolding = new Map(
    funding.steps.filter((s) => s.kind === "add").map((s) => [s.holdingName, s.value.amount]),
  );
  assert.equal(byHolding.get("Cash"), "400.00");
  assert.equal(byHolding.get("Bitcoin"), "350.00");
  assert.equal(byHolding.get("Ethereum"), "250.00");
});

test("each step carries an exact integer amount, so the wallet never has to parse a decimal", async () => {
  const ctx = fakeContext(onPlan());
  const funding = await buildFundingPlan(ctx, OWNER, { amount: "1000" });

  for (const step of funding.steps) {
    assert.match(step.rawUnits, /^\d+$/, `${step.id} should carry whole base units`);
    assert.ok(BigInt(step.rawUnits) > 0n);
  }

  // $350 of Bitcoin at $50,000 is 0.007 BTC, which in 8 decimals is exactly 700,000 units.
  const btc = funding.steps.find((s) => s.kind === "add" && s.holdingId === TOKENS.mBTC);
  assert.ok(btc);
  assert.equal(BigInt(btc.rawUnits), 700_000n);
});

test("permission comes before the transfer, for every investment", async () => {
  const ctx = fakeContext(onPlan());
  const funding = await buildFundingPlan(ctx, OWNER, { amount: "1000" });

  for (const step of funding.steps.filter((s) => s.kind === "add")) {
    const allowIndex = funding.steps.findIndex((s) => s.kind === "allow" && s.holdingId === step.holdingId);
    const addIndex = funding.steps.indexOf(step);
    assert.ok(allowIndex >= 0, `${step.holdingName} should need permission first`);
    assert.ok(allowIndex < addIndex, `${step.holdingName}: permission must come before the transfer`);
  }
});

test("permission is not asked for twice when it has already been given", async () => {
  const spec = onPlan();
  // Already allowed far more Cash than this funding needs.
  spec.allowances = { [TOKENS.mUSD]: 10n ** 12n };
  const ctx = fakeContext(spec);

  const funding = await buildFundingPlan(ctx, OWNER, { amount: "1000" });
  const cashAllow = funding.steps.find((s) => s.kind === "allow" && s.holdingId === TOKENS.mUSD);
  assert.equal(cashAllow, undefined);
  assert.ok(funding.steps.some((s) => s.kind === "add" && s.holdingId === TOKENS.mUSD));
});

test("a shortfall is reported before anything is signed", async () => {
  const spec = onPlan();
  spec.wallet = { [TOKENS.mUSD]: 10n * 10n ** 6n }; // $10 of cash, nothing else
  const ctx = fakeContext(spec);

  const funding = await buildFundingPlan(ctx, OWNER, { amount: "1000" });
  assert.equal(funding.hasShortfall, true);
  assert.ok(funding.shortfalls.length >= 2);
  const cash = funding.shortfalls.find((s) => s.holdingName === "Cash");
  assert.ok(cash);
  assert.equal(cash.has, "10");
});

test("a nonsense amount is refused with something a person can act on", async () => {
  const ctx = fakeContext(onPlan());
  for (const amount of ["", "abc", "-100", "1,000", "10e5"]) {
    await assert.rejects(
      () => buildFundingPlan(ctx, OWNER, { amount }),
      (err: unknown) => err instanceof DomainError && err.code === "bad_amount",
      `"${amount}" should be refused`,
    );
  }
});

test("zero is refused", async () => {
  const ctx = fakeContext(onPlan());
  await assert.rejects(
    () => buildFundingPlan(ctx, OWNER, { amount: "0" }),
    (err: unknown) => err instanceof DomainError && err.code === "bad_amount",
  );
});

test("an amount too small to spread is refused, not silently rounded away", async () => {
  const ctx = fakeContext(onPlan());
  await assert.rejects(
    () => buildFundingPlan(ctx, OWNER, { amount: "0.000000000000000001" }),
    (err: unknown) => err instanceof DomainError && err.code === "amount_too_small",
  );
});

test("you cannot add money before you have a plan", async () => {
  const ctx = fakeContext(noPlan());
  await assert.rejects(
    () => buildFundingPlan(ctx, OWNER, { amount: "1000" }),
    (err: unknown) => err instanceof DomainError && err.code === "no_plan" && err.status === 409,
  );
});

test("money reads as the plan sees it: total, available and invested", async () => {
  const ctx = fakeContext(onPlan());
  const money = await getMoney(ctx, OWNER);

  assert.equal(money.total.amount, "10000.00");
  assert.equal(money.available.amount, "4000.00");
  assert.equal(money.invested.amount, "6000.00");
  assert.equal(money.isEmpty, false);
  assert.equal(money.holdings.length, 3);

  const cash = money.holdings.find((h) => h.code === "mUSD");
  assert.ok(cash);
  assert.equal(cash.name, "Cash");
  assert.equal(cash.isAvailableCash, true);
  assert.equal(cash.sharePercent, 40);
  assert.equal(cash.targetPercent, 40);
  assert.equal(cash.offTargetByPercent, 0);
});

test("money reflects a holding that has run past its target", async () => {
  const ctx = fakeContext(offPlan());
  const money = await getMoney(ctx, OWNER);
  const btc = money.holdings.find((h) => h.code === "mBTC");
  assert.ok(btc);
  assert.ok(btc.sharePercent > 50, `Bitcoin should dominate, got ${btc.sharePercent}%`);
  assert.ok(btc.offTargetByPercent > 15, "and should read as well past its target");
});

test("someone with no plan is told so, rather than shown an empty portfolio", async () => {
  const ctx = fakeContext(noPlan());
  await assert.rejects(
    () => getMoney(ctx, OWNER),
    (err: unknown) => err instanceof DomainError && err.code === "no_plan" && err.status === 404,
  );
});

test("the money shown belongs to the person asking and nobody else", async () => {
  // The fake chain answers for OWNER only, exactly as the contracts key state by address.
  const ctx = fakeContext(onPlan(), OWNER);

  const mine = await getMoney(ctx, OWNER);
  assert.equal(mine.total.amount, "10000.00");

  // Asking for a different account reads that account's state — which is empty — and never
  // discloses the owner's. Addresses are not interchangeable anywhere in this layer.
  await assert.rejects(
    () => getMoney(ctx, SOMEONE_ELSE),
    (err: unknown) => err instanceof DomainError && err.code === "no_plan",
  );
});

test("wallet balances are reported in the person's own vocabulary", async () => {
  const ctx = fakeContext(onPlan());
  const holdings = await getWalletBalances(ctx, OWNER);
  const names = holdings.map((h) => h.name).sort();
  assert.deepEqual(names, ["Bitcoin", "Cash", "Ethereum"]);
  for (const h of holdings) {
    assert.match(h.value, /^\d+(\.\d+)?$/, "a value should be a plain decimal string");
  }
});
