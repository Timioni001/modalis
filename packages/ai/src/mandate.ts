/**
 * Mandate builder: interview answers -> the exact parameters PortfolioMandate.setMandate stores.
 *
 * This is the hinge of the whole product. Everything above it is advice; everything below it is
 * enforcement. `validateMandateDraft` mirrors the contract's own preconditions, so an invalid
 * mandate is caught here instead of costing the user a failed transaction — and the contract
 * re-checks all of it regardless, because this file is not the security boundary.
 */
import { planAllocation, maxSingleAssetBpsFor, rebalanceThresholdBpsFor } from "./allocation.ts";
import { monthlyContribution, profileRisk } from "./profile.ts";
import type { AllocationPlan, InterviewAnswers, MandateDraft, ParsedGoal, RiskProfile, UniverseAsset } from "./types.ts";

const BPS = 10_000;

/** Default execution slippage ceiling, in bps. Tight by design for a wealth product. */
export const DEFAULT_MAX_SLIPPAGE_BPS = 200;

export type BuildMandateOptions = {
  /** Reference time for the target date. Defaults to now. Injected so tests are deterministic. */
  now?: Date;
  maxSlippageBps?: number;
  /** Supply when a free-text goal was parsed by the LLM; otherwise derived from the answers. */
  goal?: ParsedGoal;
};

export function buildMandateDraft(
  answers: InterviewAnswers,
  universe: UniverseAsset[],
  opts: BuildMandateOptions = {},
): MandateDraft {
  assertAnswers(answers);

  const now = opts.now ?? new Date();
  const profile = profileRisk(answers);
  const plan = planAllocation(profile, universe, answers.horizonMonths);

  const goal: ParsedGoal =
    opts.goal ?? {
      goalType: answers.goalType,
      targetValue: answers.targetValue,
      horizonMonths: answers.horizonMonths,
      source: "interview",
    };

  const draft: MandateDraft = {
    params: {
      targetValue: usdToE18(answers.targetValue),
      targetDate: BigInt(Math.floor(addMonths(now, answers.horizonMonths).getTime() / 1000)),
      maxDrawdownBps: profile.maxDrawdownBps,
      minLiquidityBps: profile.liquidityRequirementBps,
      rebalanceThresholdBps: rebalanceThresholdBpsFor(profile.riskScore),
      maxSingleAssetBps: maxSingleAssetBpsFor(profile.riskScore),
      maxSlippageBps: opts.maxSlippageBps ?? DEFAULT_MAX_SLIPPAGE_BPS,
    },
    allocations: plan.allocations,
    profile,
    plan,
    goal,
    monthlyContributionUsd: monthlyContribution(answers),
  };

  // A draft is never returned unless it would survive the contract's own checks.
  const problems = validateMandateDraft(draft, universe, now);
  if (problems.length > 0) {
    throw new Error(`Generated mandate would be rejected on-chain:\n- ${problems.join("\n- ")}`);
  }
  return draft;
}

/**
 * Mirrors PortfolioMandate._validateParams and _validateAllocations, plus the per-asset registry
 * ceiling that validate() enforces later. Returns every problem rather than the first.
 */
export function validateMandateDraft(
  draft: MandateDraft,
  universe: UniverseAsset[],
  now: Date = new Date(),
): string[] {
  const p = draft.params;
  const problems: string[] = [];

  if (p.targetValue <= 0n) problems.push("targetValue must be greater than zero (INVALID_TARGET)");
  if (p.targetDate <= BigInt(Math.floor(now.getTime() / 1000))) {
    problems.push("targetDate must be in the future (INVALID_TARGET_DATE)");
  }
  for (const [name, v] of [
    ["maxDrawdownBps", p.maxDrawdownBps],
    ["minLiquidityBps", p.minLiquidityBps],
    ["rebalanceThresholdBps", p.rebalanceThresholdBps],
    ["maxSlippageBps", p.maxSlippageBps],
  ] as const) {
    if (v < 0 || v > BPS) problems.push(`${name} must be between 0 and 10000 (BPS_OUT_OF_RANGE)`);
  }
  if (p.maxSingleAssetBps <= 0 || p.maxSingleAssetBps > BPS) {
    problems.push("maxSingleAssetBps must be between 1 and 10000 (BPS_OUT_OF_RANGE)");
  }

  if (draft.allocations.length === 0) problems.push("a mandate needs at least one allocation (EMPTY_ALLOCATIONS)");

  const seen = new Set<string>();
  let sum = 0;
  let liquidTarget = 0;

  for (const a of draft.allocations) {
    const asset = universe.find((u) => u.token.toLowerCase() === a.token.toLowerCase());
    if (!asset) {
      problems.push(`${a.symbol} (${a.token}) is not in the asset universe (ASSET_NOT_ENABLED)`);
      continue;
    }
    if (seen.has(a.token.toLowerCase())) problems.push(`${a.symbol} appears twice (DUPLICATE_ASSET)`);
    seen.add(a.token.toLowerCase());

    if (a.maxBps > BPS || a.minBps > a.targetBps || a.targetBps > a.maxBps) {
      problems.push(
        `${a.symbol} range is invalid: need minBps <= targetBps <= maxBps <= 10000, got ` +
          `${a.minBps}/${a.targetBps}/${a.maxBps} (INVALID_RANGE)`,
      );
    }
    if (a.targetBps > asset.assetMaxBps) {
      problems.push(
        `${a.symbol} target ${a.targetBps} exceeds its registry ceiling ${asset.assetMaxBps} (MAX_ALLOCATION_EXCEEDED)`,
      );
    }
    if (a.maxBps > asset.assetMaxBps) {
      problems.push(
        `${a.symbol} range maximum ${a.maxBps} exceeds its registry ceiling ${asset.assetMaxBps}, so the ` +
          `top of its range is unreachable (MAX_ALLOCATION_EXCEEDED)`,
      );
    }
    if (!asset.isLiquid) {
      if (a.targetBps > p.maxSingleAssetBps) {
        problems.push(
          `${a.symbol} target ${a.targetBps} exceeds maxSingleAssetBps ${p.maxSingleAssetBps} (MAX_ALLOCATION_EXCEEDED)`,
        );
      }
      if (a.maxBps > p.maxSingleAssetBps) {
        problems.push(
          `${a.symbol} range maximum ${a.maxBps} exceeds maxSingleAssetBps ${p.maxSingleAssetBps}, so the top of ` +
            `its range could never be held (MAX_ALLOCATION_EXCEEDED)`,
        );
      }
    } else {
      liquidTarget += a.targetBps;
    }
    sum += a.targetBps;
  }

  if (sum !== BPS) problems.push(`allocation targets must sum to 10000 bps, got ${sum} (TARGETS_NOT_100_PERCENT)`);
  if (liquidTarget < p.minLiquidityBps) {
    problems.push(
      `liquid targets total ${liquidTarget} bps, below minLiquidityBps ${p.minLiquidityBps} (LIQUIDITY_TARGET_TOO_LOW)`,
    );
  }

  return problems;
}

/**
 * USD -> 1e18 fixed point.
 *
 * Pass a STRING for an exact conversion (`usdToE18("2840.21")`). A `number` is a float and cannot
 * represent most decimal amounts exactly — `(0.1).toFixed(18)` is "0.100000000000000006" — so
 * numbers are rounded to `NUMBER_PRECISION_DP` decimal places first, which removes the float
 * artefact while preserving any amount a person could plausibly enter. Sub-micro-dollar precision
 * is not meaningful for a savings target.
 */
export const NUMBER_PRECISION_DP = 6;

export function usdToE18(usd: number | string): bigint {
  const text =
    typeof usd === "string"
      ? usd.trim()
      : (() => {
          if (!Number.isFinite(usd)) throw new Error(`Invalid USD amount: ${usd}`);
          return usd.toFixed(NUMBER_PRECISION_DP);
        })();

  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`Invalid USD amount: ${usd}`);

  const [whole, frac = ""] = text.split(".");
  if (frac.length > 18) throw new Error(`USD amount has more than 18 decimal places: ${usd}`);
  return BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(18, "0"));
}

/** Calendar-correct month arithmetic, clamped so 31 Jan + 1 month lands in February. */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function assertAnswers(a: InterviewAnswers): void {
  if (!(a.targetValue > 0)) throw new Error("targetValue must be greater than zero");
  if (!(a.horizonMonths >= 1)) throw new Error("horizonMonths must be at least 1");
  if (a.initialAmount < 0 || a.contributionAmount < 0) throw new Error("amounts cannot be negative");
  if (a.maxTolerableDrawdownPct < 0 || a.maxTolerableDrawdownPct > 100) {
    throw new Error("maxTolerableDrawdownPct must be between 0 and 100");
  }
}

/** Convenience: the full deterministic pipeline, for callers that only want the result. */
export function runIntelligencePipeline(
  answers: InterviewAnswers,
  universe: UniverseAsset[],
  opts: BuildMandateOptions = {},
): { draft: MandateDraft; profile: RiskProfile; plan: AllocationPlan } {
  const draft = buildMandateDraft(answers, universe, opts);
  return { draft, profile: draft.profile, plan: draft.plan };
}
