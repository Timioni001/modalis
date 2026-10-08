/**
 * Portfolio health and Ask Modalis.
 *
 * The property that matters most is the evidence rule: an answer may only state a figure that is
 * in the data it was given. These tests check that directly, by scanning every answer for dollar
 * amounts and percentages and requiring each one to appear in the evidence or the inputs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessHealth, type HealthInput } from "../src/health.ts";
import { answer, answerIntent, classify, SUGGESTED_QUESTIONS, type Facts } from "../src/answers.ts";
import { money } from "../src/models.ts";

const RULES = {
  maxInOneInvestmentPercent: 30,
  moneyKeptAvailablePercent: 10,
  comfortableLosingPercent: 15,
  adjustWhenOffTargetByPercent: 4,
};

const base: HealthInput = {
  planStatus: "active",
  rules: RULES,
  moneyEmpty: false,
  allocation: { furthestOffTargetPercent: 1, largestHoldingPercent: 22, availableMoneyPercent: 25 },
  goal: {
    health: "on_track",
    shortfall: money("0"),
    requiredMonthly: money("0"),
    monthsRemaining: 48,
    percentComplete: 40,
  },
};

test("a plan inside every limit is healthy and says so plainly", () => {
  const h = assessHealth(base);
  assert.equal(h.state, "healthy");
  assert.equal(h.reasons.length, 0);
  assert.match(h.headline, /inside your plan/);
});

test("a pause outranks everything, because nothing can act while it holds", () => {
  const h = assessHealth({
    ...base,
    planStatus: "paused",
    allocation: { furthestOffTargetPercent: 9, largestHoldingPercent: 40, availableMoneyPercent: 2 },
  });
  assert.equal(h.state, "restricted");
  assert.equal(h.reasons[0].code, "plan_paused");
});

test("going past a limit needs the person, and the reason carries both numbers", () => {
  const h = assessHealth({
    ...base,
    allocation: { furthestOffTargetPercent: 1, largestHoldingPercent: 33, availableMoneyPercent: 25 },
  });
  assert.equal(h.state, "action_required");
  const r = h.reasons.find((x) => x.code === "over_single_limit")!;
  assert.deepEqual(r.evidence.map((e) => e.value), ["33%", "30%"]);
});

test("drift short of the limit is worth a look, not an alarm", () => {
  const h = assessHealth({
    ...base,
    allocation: { furthestOffTargetPercent: 3.2, largestHoldingPercent: 22, availableMoneyPercent: 25 },
  });
  assert.equal(h.state, "watch");
  assert.equal(h.reasons[0].code, "drift_building");
});

test("too little kept available is caught against the person's own floor", () => {
  const h = assessHealth({
    ...base,
    allocation: { furthestOffTargetPercent: 1, largestHoldingPercent: 22, availableMoneyPercent: 6 },
  });
  assert.ok(h.reasons.some((r) => r.code === "below_available_floor"));
});

test("an empty plan asks for money and does not pretend to judge allocations", () => {
  const h = assessHealth({ ...base, moneyEmpty: true });
  assert.deepEqual(h.reasons.map((r) => r.code), ["not_funded"]);
});

test("a goal falling short is reported with the monthly figure that fixes it", () => {
  const h = assessHealth({
    ...base,
    goal: { ...base.goal!, health: "off_track", shortfall: money("8968.33"), requiredMonthly: money("149.47") },
  });
  const r = h.reasons.find((x) => x.code === "goal_off_track")!;
  assert.match(r.message, /\$8,968 short/);
  assert.match(r.message, /\$149 a month/);
});

// ------------------------------------------------------------------- Ask Modalis

test("every suggested question routes to its own answer", () => {
  for (const s of SUGGESTED_QUESTIONS) assert.equal(classify(s.question), s.intent, s.question);
});

test("a question outside what the system knows is declined, not guessed at", () => {
  const a = answer("Should I buy Tesla stock?", {});
  assert.equal(a.intent, "unknown");
  assert.equal(a.evidence.length, 0);
});

const facts: Facts = {
  plan: {
    id: null,
    status: "active",
    version: 1,
    riskLevel: { level: "balanced", score: 50, reasons: ["You said you'd wait out a fall."] },
    howMoneyIsSpread: [],
    rules: RULES,
    goal: {} as never,
    summary: "You're saving $20,000 for a home.",
    adjustmentsEnabled: true,
  },
  money: {
    total: money("11031.66"),
    available: money("3030.62"),
    invested: money("8001.04"),
    isEmpty: false,
    asOf: "2026-01-01T00:00:00Z",
    holdings: [
      { id: "a", name: "Bitcoin", code: "mBTC", value: money("3281.04"), sharePercent: 29.7, targetPercent: 25.8, offTargetByPercent: 3.9, isAvailableCash: false, units: "0" },
      { id: "b", name: "Cash", code: "mUSD", value: money("3030.62"), sharePercent: 27.5, targetPercent: 27, offTargetByPercent: 0.5, isAvailableCash: true, units: "0" },
    ],
  },
  allocation: { furthestOffTargetPercent: 3.9, largestHoldingPercent: 29.7, availableMoneyPercent: 27.5 },
};

test("no answer states a figure that is not in its evidence or its inputs", () => {
  const inputs = JSON.stringify(facts);
  const figures = /\$[\d,]+|\d+(\.\d+)?%/g;
  for (const s of SUGGESTED_QUESTIONS) {
    const a = answerIntent(s.intent, facts);
    const known = JSON.stringify(a.evidence) + inputs;
    for (const fig of a.text.match(figures) ?? []) {
      const bare = fig.replace(/[$,%]/g, "");
      assert.ok(known.includes(fig) || known.includes(bare), `${s.intent}: "${fig}" has no source`);
    }
  }
});

test("asking what happens on approval, with nothing pending, says nothing is waiting", () => {
  const a = answerIntent("if_i_approve", { ...facts, adjustment: null });
  assert.match(a.text, /nothing waiting/i);
});

test("a change the rules refuse is described as refused, never as something that will happen", () => {
  const a = answerIntent("if_i_approve", {
    ...facts,
    adjustment: {
      id: null,
      status: "blocked" as never,
      reasons: [],
      explanation: "x",
      change: { sell: { name: "Bitcoin", code: "mBTC", amount: "0.01" }, buy: { name: "Cash", code: "mUSD", atLeast: "500" }, before: [] },
      allowedByYourRules: false,
      blockedBecause: "over your 30% limit",
    },
  });
  assert.match(a.text, /refuse/);
  assert.doesNotMatch(a.text, /Modalis moves/);
});

test("an unknown balance is never reported as an empty one", () => {
  const h = assessHealth({ ...base, moneyEmpty: undefined });
  assert.ok(!h.reasons.some((r) => r.code === "not_funded"));
  const a = answerIntent("my_money", { ...facts, money: null });
  assert.doesNotMatch(a.text, /\$0|no money/i);
  const n = answerIntent("needs_attention", { ...facts, money: null });
  assert.doesNotMatch(JSON.stringify(n), /\$0/);
});
