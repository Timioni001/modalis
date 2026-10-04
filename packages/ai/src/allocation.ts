/**
 * Allocation planner. Deterministic, transparent, and bounded by the same rules the contract
 * enforces — so a plan this module produces is always a plan PortfolioMandate will accept.
 *
 * The strategy is deliberately ordinary: strategic weights, a glide path that gets more defensive
 * as the goal approaches, concentration caps, and a liquidity floor. There is no alpha model here
 * and the product must never imply one.
 *
 * Invariants, asserted in tests:
 *   1. target bps sum to exactly 10000
 *   2. minBps <= targetBps <= maxBps for every asset
 *   3. no non-liquid asset's target or max exceeds maxSingleAssetBps
 *   4. no asset's target or max exceeds its AssetRegistry ceiling
 *   5. the liquid sleeve's target sum is >= the mandate's minLiquidityBps
 */
import type { AllocationPlan, AssetClass, PlannedAllocation, RiskProfile, UniverseAsset } from "./types.ts";

const BPS = 10_000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Glide path: the most the portfolio may hold in growth assets at a given horizon, before any
 * risk adjustment. This is what makes the product goal-native rather than risk-questionnaire-native.
 */
export function growthCeilingBps(horizonMonths: number): number {
  if (horizonMonths >= 60) return 7000;
  if (horizonMonths >= 36) return 6000;
  if (horizonMonths >= 24) return 4500;
  if (horizonMonths >= 12) return 3000;
  return 1500;
}

/** Concentration ceiling for any single non-liquid asset. Tighter for lower risk scores. */
export function maxSingleAssetBpsFor(riskScore: number): number {
  if (riskScore < 20) return 1500;
  if (riskScore < 35) return 2000;
  if (riskScore < 65) return 3000;
  return 4000;
}

/** Rebalance threshold: how far an asset may drift from target before action is proposed. */
export function rebalanceThresholdBpsFor(riskScore: number): number {
  // A more volatile portfolio needs a wider band, or it would churn.
  return riskScore >= 65 ? 500 : riskScore >= 35 ? 400 : 300;
}

type Slice = { asset: UniverseAsset; weight: number; capBps: number };

/**
 * Splits `totalBps` across `slices` in proportion to weight, respecting each slice's cap.
 * Uses largest-remainder rounding so the parts sum exactly, and reports anything the caps
 * made unallocatable.
 */
export function distribute(totalBps: number, slices: Slice[]): { bps: number[]; leftover: number } {
  const n = slices.length;
  const bps = new Array<number>(n).fill(0);
  if (n === 0 || totalBps <= 0) return { bps, leftover: Math.max(0, totalBps) };

  let remaining = totalBps;
  const open = slices.map((_, i) => i);

  // Iterate: proportional split, then push anything over a cap back into the pool.
  for (let pass = 0; pass < n + 1 && remaining > 0 && open.length > 0; pass++) {
    const weightSum = open.reduce((s, i) => s + Math.max(0, slices[i].weight), 0);
    if (weightSum <= 0) break;

    const raw = open.map((i) => (remaining * Math.max(0, slices[i].weight)) / weightSum);
    const floored = raw.map(Math.floor);
    let allocated = floored.reduce((s, v) => s + v, 0);

    // Largest-remainder: hand out the rounding dust to the biggest fractional parts.
    const order = raw
      .map((v, k) => ({ k, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    let dust = remaining - allocated;
    for (const { k } of order) {
      if (dust <= 0) break;
      floored[k] += 1;
      allocated += 1;
      dust -= 1;
    }

    // Apply, clamping to caps.
    let consumed = 0;
    const stillOpen: number[] = [];
    open.forEach((i, k) => {
      const room = slices[i].capBps - bps[i];
      const give = Math.min(floored[k], Math.max(0, room));
      bps[i] += give;
      consumed += give;
      if (bps[i] < slices[i].capBps) stillOpen.push(i);
    });

    remaining -= consumed;
    if (consumed === 0) break; // every open slice is at its cap
    open.length = 0;
    open.push(...stillOpen);
  }

  return { bps, leftover: remaining };
}

export type PlanOptions = {
  /** Width of each asset's allowed range around target, in bps. Defaults to the threshold + 200. */
  bandBps?: number;
};

export function planAllocation(
  profile: RiskProfile,
  universe: UniverseAsset[],
  horizonMonths: number,
  opts: PlanOptions = {},
): AllocationPlan {
  if (universe.length === 0) throw new Error("Cannot plan an allocation with an empty asset universe");

  const liquid = universe.filter((a) => a.isLiquid);
  if (liquid.length === 0) {
    throw new Error("Asset universe has no liquid asset, so the liquidity floor could never be met");
  }

  const rationale: string[] = [];
  const ceiling = growthCeilingBps(horizonMonths);
  const maxSingle = maxSingleAssetBpsFor(profile.riskScore);
  const threshold = rebalanceThresholdBpsFor(profile.riskScore);
  const band = opts.bandBps ?? threshold + 200;

  // --- Sleeve sizing
  const liquidBps = clamp(profile.liquidityRequirementBps, 0, BPS);
  let growthBps = Math.round((ceiling * profile.riskScore) / 100 / 100) * 100; // nearest whole %
  growthBps = clamp(growthBps, 0, BPS - liquidBps);
  let defensiveBps = BPS - liquidBps - growthBps;

  rationale.push(
    `With ${horizonMonths} months to go, growth assets are capped at ${(ceiling / 100).toFixed(0)}% by the glide path.`,
  );
  rationale.push(
    `Your risk score of ${profile.riskScore}/100 sets the growth sleeve to ${(growthBps / 100).toFixed(0)}%.`,
  );
  rationale.push(
    `${(liquidBps / 100).toFixed(0)}% stays liquid and ${(defensiveBps / 100).toFixed(0)}% goes to defensive assets.`,
  );

  // --- Within-sleeve distribution, respecting both caps
  const capFor = (a: UniverseAsset) => (a.isLiquid ? a.assetMaxBps : Math.min(maxSingle, a.assetMaxBps));
  const slicesFor = (cls: AssetClass): Slice[] =>
    universe
      .filter((a) => a.assetClass === cls)
      .map((a) => ({ asset: a, weight: a.classWeight ?? 1, capBps: capFor(a) }));

  const growthSlices = slicesFor("growth");
  const defensiveSlices = slicesFor("defensive");
  const liquidSlices = slicesFor("liquid");

  const g = distribute(growthBps, growthSlices);
  // Anything the concentration cap would not let us put in growth goes defensive, then liquid.
  if (g.leftover > 0) {
    rationale.push(
      `${(g.leftover / 100).toFixed(0)}% could not go to growth without breaching the ` +
        `${(maxSingle / 100).toFixed(0)}% single-asset limit, so it moved to safer assets.`,
    );
    defensiveBps += g.leftover;
    growthBps -= g.leftover;
  }

  const d = distribute(defensiveBps, defensiveSlices);
  let extraLiquid = d.leftover;
  if (extraLiquid > 0) defensiveBps -= extraLiquid;

  const l = distribute(liquidBps + extraLiquid, liquidSlices);
  // The liquid sleeve's cap is 10000 for cash-like assets, so leftover here means a
  // misconfigured universe rather than a plan we can repair.
  if (l.leftover > 0) {
    throw new Error(
      `Could not place ${l.leftover} bps: the liquid assets' registry ceilings are too low to absorb it`,
    );
  }

  // --- Assemble
  const byToken = new Map<string, number>();
  growthSlices.forEach((s, i) => byToken.set(s.asset.token, (byToken.get(s.asset.token) ?? 0) + g.bps[i]));
  defensiveSlices.forEach((s, i) => byToken.set(s.asset.token, (byToken.get(s.asset.token) ?? 0) + d.bps[i]));
  liquidSlices.forEach((s, i) => byToken.set(s.asset.token, (byToken.get(s.asset.token) ?? 0) + l.bps[i]));

  // --- Reconcile any residual rounding against the largest liquid holding, so the sum is exact
  // and the correction can only ever make the liquidity floor easier to meet.
  const sum = [...byToken.values()].reduce((a, b) => a + b, 0);
  if (sum !== BPS) {
    const target = largestOf(liquid, byToken) ?? liquid[0];
    byToken.set(target.token, (byToken.get(target.token) ?? 0) + (BPS - sum));
  }

  const allocations: PlannedAllocation[] = universe
    .map((a) => {
      const targetBps = byToken.get(a.token) ?? 0;
      const cap = capFor(a);
      const maxBps = clamp(targetBps + band, targetBps, cap);
      // The liquid sleeve's floor is what keeps the mandate's liquidity rule satisfiable.
      const floor = a.isLiquid ? Math.min(targetBps, liquidFloorShare(a, liquid, profile)) : 0;
      const minBps = clamp(Math.max(targetBps - band, floor), 0, targetBps);
      return { token: a.token, symbol: a.symbol, isLiquid: a.isLiquid, targetBps, minBps, maxBps };
    })
    // An asset the plan gives nothing to is left out of the mandate entirely rather than
    // registered at 0%, so the mandate lists only assets the portfolio actually uses.
    .filter((a) => a.targetBps > 0);

  const liquidTotal = allocations.filter((a) => a.isLiquid).reduce((s, a) => s + a.targetBps, 0);

  return {
    allocations,
    growthBps: allocations.filter((a) => classOf(universe, a.token) === "growth").reduce((s, a) => s + a.targetBps, 0),
    defensiveBps: allocations
      .filter((a) => classOf(universe, a.token) === "defensive")
      .reduce((s, a) => s + a.targetBps, 0),
    liquidBps: liquidTotal,
    growthCeilingBps: ceiling,
    rationale,
  };
}

function classOf(universe: UniverseAsset[], token: string): AssetClass | undefined {
  return universe.find((a) => a.token === token)?.assetClass;
}

function largestOf(assets: UniverseAsset[], byToken: Map<string, number>): UniverseAsset | undefined {
  return [...assets].sort((a, b) => (byToken.get(b.token) ?? 0) - (byToken.get(a.token) ?? 0))[0];
}

/**
 * The share of the liquidity floor this liquid asset is responsible for. With a single liquid
 * asset it is the whole floor, which is what makes MIN_LIQUIDITY_BREACHED and the per-asset
 * minimum consistent with each other.
 */
function liquidFloorShare(asset: UniverseAsset, liquid: UniverseAsset[], profile: RiskProfile): number {
  if (liquid.length <= 1) return profile.liquidityRequirementBps;
  return Math.floor(profile.liquidityRequirementBps / liquid.length);
}
