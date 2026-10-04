import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMandateDraft,
  distribute,
  explainMandate,
  explainRebalance,
  explainRejection,
  growthCeilingBps,
  interpretGoal,
  maxSingleAssetBpsFor,
  planAllocation,
  profileRisk,
  usdToE18,
  validateMandateDraft,
  writeExplanation,
  addMonths,
  type InterviewAnswers,
  type UniverseAsset,
} from "../src/index.ts";

/** The demo asset universe, matching what the deploy script registers. */
const UNIVERSE: UniverseAsset[] = [
  { token: "0xbtc", symbol: "mBTC", decimals: 8, assetClass: "growth", isLiquid: false, assetMaxBps: 5000, classWeight: 6 },
  { token: "0xeth", symbol: "mETH", decimals: 18, assetClass: "growth", isLiquid: false, assetMaxBps: 5000, classWeight: 4 },
  { token: "0xbond", symbol: "mBOND", decimals: 18, assetClass: "defensive", isLiquid: false, assetMaxBps: 5000 },
  { token: "0xusd", symbol: "mUSD", decimals: 6, assetClass: "liquid", isLiquid: true, assetMaxBps: 10000 },
];

/** The brief's demo user: $20,000 for a house in five years. */
const HOUSE: InterviewAnswers = {
  goalType: "house",
  targetValue: 20_000,
  initialAmount: 2_000,
  contributionAmount: 200,
  contributionCadence: "monthly",
  horizonMonths: 60,
  drawdownResponse: "do_nothing",
  maxTolerableDrawdownPct: 15,
  liquidityNeed: "some",
  incomeStability: "stable",
};

const NOW = new Date("2026-10-04T00:00:00Z");

// ---------------------------------------------------------------- profiler

test("risk score is the lower of willingness and ability", () => {
  // Willing but short horizon: ability must dominate.
  const brave = profileRisk({ ...HOUSE, horizonMonths: 6, drawdownResponse: "invest_more", maxTolerableDrawdownPct: 30 });
  assert.equal(brave.riskScore, Math.min(brave.riskTolerance, brave.riskCapacity));
  assert.ok(brave.riskCapacity < brave.riskTolerance, "short horizon should cut ability");

  // Long horizon but panicky: willingness must dominate.
  const timid = profileRisk({ ...HOUSE, horizonMonths: 120, drawdownResponse: "sell_everything", maxTolerableDrawdownPct: 2 });
  assert.equal(timid.riskScore, timid.riskTolerance);
  assert.ok(timid.riskTolerance < timid.riskCapacity);
});

test("an emergency reserve is capped to low risk and high liquidity", () => {
  const p = profileRisk({ ...HOUSE, goalType: "emergency_reserve", drawdownResponse: "invest_more", maxTolerableDrawdownPct: 30 });
  assert.ok(p.riskCapacity <= 20, `capacity ${p.riskCapacity} should be capped`);
  assert.ok(p.liquidityRequirementBps >= 5000, "an emergency reserve must stay mostly liquid");
});

test("the drawdown limit never exceeds what the user stated", () => {
  const p = profileRisk({ ...HOUSE, maxTolerableDrawdownPct: 8 });
  assert.ok(p.maxDrawdownBps <= 800, `${p.maxDrawdownBps} should not exceed the stated 8%`);
});

// --------------------------------------------------------------- glide path

test("the growth ceiling falls as the goal approaches", () => {
  const ceilings = [60, 36, 24, 12, 6].map(growthCeilingBps);
  for (let i = 1; i < ceilings.length; i++) {
    assert.ok(ceilings[i] < ceilings[i - 1], `ceiling should fall: ${ceilings}`);
  }
});

test("a nearer goal produces a more defensive plan for the same person", () => {
  const far = buildMandateDraft({ ...HOUSE, horizonMonths: 60 }, UNIVERSE, { now: NOW });
  const near = buildMandateDraft({ ...HOUSE, horizonMonths: 9 }, UNIVERSE, { now: NOW });
  assert.ok(near.plan.growthBps < far.plan.growthBps, "growth should shrink as the date nears");
  assert.ok(near.plan.liquidBps >= far.plan.liquidBps, "liquidity should not shrink as the date nears");
});

// -------------------------------------------------------------- distribute

test("distribute respects caps and sums exactly", () => {
  const mk = (cap: number, weight = 1) =>
    ({ asset: { token: "x", symbol: "x", decimals: 18, assetClass: "growth", isLiquid: false, assetMaxBps: cap }, weight, capBps: cap }) as never;
  const r = distribute(7000, [mk(4000, 6), mk(4000, 4)]);
  assert.equal(r.bps.reduce((a, b) => a + b, 0), 7000);
  assert.equal(r.leftover, 0);
  assert.ok(r.bps.every((b, i) => b <= 4000), "no slice may exceed its cap");

  // Caps that cannot absorb the total must report the remainder rather than overflow.
  const tight = distribute(7000, [mk(2000), mk(2000)]);
  assert.equal(tight.bps[0], 2000);
  assert.equal(tight.bps[1], 2000);
  assert.equal(tight.leftover, 3000);
});

// -------------------------------------------------------- allocation invariants

test("every generated plan satisfies the contract's rules", () => {
  const responses = ["sell_everything", "sell_some", "do_nothing", "invest_more"] as const;
  const liquidity = ["none", "some", "significant"] as const;
  const income = ["unstable", "stable", "very_stable"] as const;
  const goals = ["house", "education", "long_term_wealth", "emergency_reserve", "retirement", "custom"] as const;

  let checked = 0;
  for (const horizonMonths of [3, 6, 11, 12, 18, 24, 30, 36, 48, 60, 120, 360]) {
    for (const drawdownResponse of responses) {
      for (const liquidityNeed of liquidity) {
        for (const incomeStability of income) {
          for (const maxTolerableDrawdownPct of [0, 5, 15, 30, 60]) {
            for (const goalType of goals) {
              const answers: InterviewAnswers = {
                ...HOUSE,
                goalType,
                horizonMonths,
                drawdownResponse,
                liquidityNeed,
                incomeStability,
                maxTolerableDrawdownPct,
              };
              const draft = buildMandateDraft(answers, UNIVERSE, { now: NOW });
              // buildMandateDraft throws if the mandate would be rejected, so reaching here is
              // already the assertion; re-run the validator explicitly for a clear failure.
              const problems = validateMandateDraft(draft, UNIVERSE, NOW);
              assert.deepEqual(problems, [], `invalid plan for ${JSON.stringify({ goalType, horizonMonths, drawdownResponse, liquidityNeed, incomeStability, maxTolerableDrawdownPct })}: ${problems.join("; ")}`);

              const sum = draft.allocations.reduce((s, a) => s + a.targetBps, 0);
              assert.equal(sum, 10_000, "targets must sum to 100%");

              const liquid = draft.allocations.filter((a) => a.isLiquid).reduce((s, a) => s + a.targetBps, 0);
              assert.ok(liquid >= draft.params.minLiquidityBps, "liquid targets must meet the floor");

              for (const a of draft.allocations) {
                assert.ok(a.minBps <= a.targetBps && a.targetBps <= a.maxBps, `${a.symbol} range invalid`);
                if (!a.isLiquid) {
                  assert.ok(a.targetBps <= draft.params.maxSingleAssetBps, `${a.symbol} over single-asset cap`);
                  assert.ok(a.maxBps <= draft.params.maxSingleAssetBps, `${a.symbol} range top over cap`);
                }
                const asset = UNIVERSE.find((u) => u.token === a.token)!;
                assert.ok(a.maxBps <= asset.assetMaxBps, `${a.symbol} range top over registry ceiling`);
              }
              checked++;
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 1000, `expected a broad sweep, checked ${checked}`);
});

test("a universe with no liquid asset is refused rather than fudged", () => {
  const noLiquid = UNIVERSE.filter((a) => !a.isLiquid);
  const profile = profileRisk(HOUSE);
  assert.throws(() => planAllocation(profile, noLiquid, 60), /no liquid asset/);
});

test("concentration overflow moves to safer assets instead of breaching the cap", () => {
  // One growth asset, capped well below the growth sleeve the score wants.
  const single: UniverseAsset[] = [
    { token: "0xbtc", symbol: "mBTC", decimals: 8, assetClass: "growth", isLiquid: false, assetMaxBps: 1500 },
    { token: "0xbond", symbol: "mBOND", decimals: 18, assetClass: "defensive", isLiquid: false, assetMaxBps: 5000 },
    { token: "0xusd", symbol: "mUSD", decimals: 6, assetClass: "liquid", isLiquid: true, assetMaxBps: 10000 },
  ];
  const draft = buildMandateDraft({ ...HOUSE, drawdownResponse: "invest_more", maxTolerableDrawdownPct: 30, horizonMonths: 120 }, single, { now: NOW });
  const btc = draft.allocations.find((a) => a.symbol === "mBTC");
  assert.ok(!btc || btc.targetBps <= 1500, "registry ceiling must hold");
  assert.deepEqual(validateMandateDraft(draft, single, NOW), []);
});

// ----------------------------------------------------------- mandate builder

test("the demo mandate matches the brief's story", () => {
  const draft = buildMandateDraft(HOUSE, UNIVERSE, { now: NOW });
  assert.equal(draft.params.targetValue, usdToE18(20_000));
  assert.equal(draft.monthlyContributionUsd, 200);
  // Five years out, target date should be Oct 2031.
  const d = new Date(Number(draft.params.targetDate) * 1000);
  assert.equal(d.getUTCFullYear(), 2031);
  assert.equal(d.getUTCMonth(), 9);
  // The user said 15%, so the drawdown limit must not be looser than that.
  assert.ok(draft.params.maxDrawdownBps <= 1500);
  assert.ok(draft.params.minLiquidityBps >= 1000);
});

test("validateMandateDraft catches a tampered allocation", () => {
  const draft = buildMandateDraft(HOUSE, UNIVERSE, { now: NOW });
  const tampered = {
    ...draft,
    allocations: draft.allocations.map((a) =>
      a.symbol === "mBTC" ? { ...a, targetBps: a.targetBps + 2000, maxBps: a.maxBps + 2000 } : a,
    ),
  };
  const problems = validateMandateDraft(tampered, UNIVERSE, NOW);
  assert.ok(problems.length > 0, "tampering must be caught");
  assert.ok(problems.some((p) => p.includes("TARGETS_NOT_100_PERCENT") || p.includes("MAX_ALLOCATION_EXCEEDED")));
});

test("a past target date is rejected", () => {
  const draft = buildMandateDraft(HOUSE, UNIVERSE, { now: NOW });
  const problems = validateMandateDraft(draft, UNIVERSE, new Date("2040-01-01T00:00:00Z"));
  assert.ok(problems.some((p) => p.includes("INVALID_TARGET_DATE")));
});

test("nonsense answers are refused up front", () => {
  assert.throws(() => buildMandateDraft({ ...HOUSE, targetValue: 0 }, UNIVERSE, { now: NOW }), /targetValue/);
  assert.throws(() => buildMandateDraft({ ...HOUSE, horizonMonths: 0 }, UNIVERSE, { now: NOW }), /horizonMonths/);
  assert.throws(() => buildMandateDraft({ ...HOUSE, maxTolerableDrawdownPct: 150 }, UNIVERSE, { now: NOW }), /maxTolerableDrawdownPct/);
});

test("usdToE18 handles decimals a float cannot represent", () => {
  assert.equal(usdToE18(20_000), 20_000n * 10n ** 18n);
  // A naive toFixed(18) would yield 100000000000000006 here.
  assert.equal(usdToE18(0.1), 100_000_000_000_000_000n);
  assert.equal(usdToE18(2_840.21), 2_840_210_000_000_000_000_000n);
  // Strings convert exactly, with no rounding step at all.
  assert.equal(usdToE18("2840.21"), 2_840_210_000_000_000_000_000n);
  assert.equal(usdToE18("0.000000000000000001"), 1n);
  assert.throws(() => usdToE18("-5"), /Invalid USD amount/);
  assert.throws(() => usdToE18("abc"), /Invalid USD amount/);
  assert.throws(() => usdToE18(Number.NaN), /Invalid USD amount/);
});

test("addMonths clamps to the end of a short month", () => {
  assert.equal(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(addMonths(new Date("2026-10-04T00:00:00Z"), 60).toISOString().slice(0, 10), "2031-10-04");
});

test("maxSingleAssetBps tightens as the risk score falls", () => {
  assert.ok(maxSingleAssetBpsFor(10) < maxSingleAssetBpsFor(50));
  assert.ok(maxSingleAssetBpsFor(50) < maxSingleAssetBpsFor(90));
});

// -------------------------------------------------------------- explanations

test("explanations state the rule, never an opportunity", () => {
  const { body } = explainRebalance({
    sellSymbol: "mBTC",
    buySymbol: "mUSD",
    sellFromBps: 4300,
    buyFromBps: 880,
    violations: [{ code: "MAX_ALLOCATION_EXCEEDED", symbol: "mBTC", bps: 4300, limitBps: 4000 }],
    maxDriftBps: 800,
    rebalanceThresholdBps: 500,
  });
  assert.match(body, /43\.0%/);
  assert.match(body, /40\.0% limit/);
  assert.doesNotMatch(body, /opportunity|alpha|signal|predict/i);
});

test("a rejection explanation makes clear nothing moved", () => {
  const { body } = explainRejection("MAX_ALLOCATION_EXCEEDED");
  assert.match(body, /single-asset limit/);
  assert.match(body, /Nothing moved/);
});

test("the mandate explanation avoids jargon and promises", () => {
  const draft = buildMandateDraft(HOUSE, UNIVERSE, { now: NOW });
  const { body } = explainMandate(draft);
  assert.match(body, /This is the policy Modalis will use/);
  assert.match(body, /only you can change them or withdraw/);
  assert.doesNotMatch(body, /basis points|AMM|guarantee|expected return/i);
});

// ------------------------------------------------------------------- LLM layer

test("the pipeline works with no AI provider configured", async () => {
  assert.equal(await interpretGoal("I want a house", { apiKey: undefined }), null);
  const { body, model } = await writeExplanation(
    { event: "test", facts: ["a fact"], fallback: "deterministic text" },
    { apiKey: undefined },
  );
  assert.equal(body, "deterministic text");
  assert.equal(model, null);
});

test("an LLM failure falls back instead of throwing", async () => {
  const exploding = { messages: { create: async () => { throw new Error("network down"); }, parse: async () => { throw new Error("network down"); } } } as never;
  assert.equal(await interpretGoal("text", { client: exploding }), null);
  const { body } = await writeExplanation({ event: "e", facts: [], fallback: "fallback wins" }, { client: exploding });
  assert.equal(body, "fallback wins");
});

test("a refusal is treated as no usable output", async () => {
  const refusing = {
    messages: {
      parse: async () => ({ stop_reason: "refusal", parsed_output: null }),
      create: async () => ({ stop_reason: "refusal", content: [] }),
    },
  } as never;
  assert.equal(await interpretGoal("text", { client: refusing }), null);
  const { body } = await writeExplanation({ event: "e", facts: [], fallback: "safe" }, { client: refusing });
  assert.equal(body, "safe");
});

test("a valid LLM goal is adopted and marked as llm-sourced", async () => {
  const ok = {
    messages: {
      parse: async () => ({
        stop_reason: "end_turn",
        parsed_output: {
          goal_type: "house",
          target_value_usd: 20000,
          horizon_months: 60,
          confidence: "high",
          restatement: "You want $20,000 for a house in five years.",
        },
      }),
    },
  } as never;
  const r = await interpretGoal("20k for a house in 5 years", { client: ok });
  assert.ok(r);
  assert.equal(r.goal.source, "llm");
  assert.equal(r.goal.targetValue, 20000);
  assert.equal(r.goal.horizonMonths, 60);
});
