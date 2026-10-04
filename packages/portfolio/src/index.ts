/**
 * @modalis/portfolio — deterministic portfolio math. No AI, no network, no floats for money.
 *
 * `checkMandate` is a line-for-line mirror of PortfolioMandate.validate() so the planner can
 * never propose an action the contract would reject. The contract remains the security
 * boundary; this module only avoids wasting transactions (and gas) on doomed proposals.
 *
 * Money is bigint USD scaled by 1e18 (same as the contracts). Weights are integer bps.
 */

export const BPS = 10_000n;

export type Allocation = {
  token: string;
  symbol: string;
  targetBps: number;
  minBps: number;
  maxBps: number;
  isLiquid: boolean;
  /** AssetRegistry global per-asset ceiling (bps). Defaults to 10_000. */
  assetMaxBps?: number;
};

export type MandateRules = {
  maxSingleAssetBps: number;
  minLiquidityBps: number;
  rebalanceThresholdBps: number;
  maxSlippageBps: number;
  maxDrawdownBps: number;
  targetValue: bigint; // USD 1e18
  targetDate: number; // unix seconds
};

/** USD value (1e18) per allocation, SAME ORDER as `allocations`. */
export type Values = bigint[];

export type ViolationCode =
  | "MAX_ALLOCATION_EXCEEDED"
  | "ALLOCATION_ABOVE_RANGE"
  | "ALLOCATION_BELOW_MIN"
  | "MIN_LIQUIDITY_BREACHED";

export type Violation = {
  code: ViolationCode;
  token?: string;
  bps: number;
  limitBps: number;
};

export type RiskStatus = "OK" | "DRIFT" | "BREACH";

export type RiskAssessment = {
  status: RiskStatus;
  maxDriftBps: number;
  liquidityBps: number;
  largestPositionBps: number;
  violations: Violation[];
};

export type TradePlan = {
  sellToken: string;
  buyToken: string;
  usdAmount: bigint; // USD 1e18 to sell; convert to token units with `usdToUnits`
  reason: string;
};

// ------------------------------------------------------------------ basics

export function total(values: Values): bigint {
  return values.reduce((a, b) => a + b, 0n);
}

/** Integer bps per position, floored exactly like the contract. */
export function weightsBps(values: Values): number[] {
  const t = total(values);
  if (t === 0n) return values.map(() => 0);
  return values.map((v) => Number((v * BPS) / t));
}

/** currentAllocation - targetAllocation, in bps (positive = overweight). */
export function driftBps(allocs: Allocation[], values: Values): number[] {
  const w = weightsBps(values);
  return allocs.map((a, i) => w[i] - a.targetBps);
}

export function liquidityBps(allocs: Allocation[], values: Values): number {
  const t = total(values);
  if (t === 0n) return 0;
  let liquid = 0n;
  allocs.forEach((a, i) => {
    if (a.isLiquid) liquid += values[i];
  });
  return Number((liquid * BPS) / t);
}

export function goalProgress(currentValue: bigint, targetValue: bigint): number {
  if (targetValue === 0n) return 0;
  return Number((currentValue * 1_000_000n) / targetValue) / 1_000_000;
}

/**
 * Contribution gap at ZERO assumed growth: how much more per month is needed to hit the target
 * from current value. Deliberately return-free; never present projections as promises.
 */
export function contributionGapMonthly(
  currentValue: bigint,
  targetValue: bigint,
  monthsRemaining: number,
  plannedMonthly: bigint,
): { requiredMonthly: bigint; gapMonthly: bigint } {
  if (monthsRemaining <= 0) return { requiredMonthly: 0n, gapMonthly: 0n };
  const remaining = targetValue > currentValue ? targetValue - currentValue : 0n;
  const required = remaining / BigInt(monthsRemaining);
  return { requiredMonthly: required, gapMonthly: required > plannedMonthly ? required - plannedMonthly : 0n };
}

export function usdToUnits(usdE18: bigint, priceE18: bigint, decimals: number): bigint {
  return (usdE18 * 10n ** BigInt(decimals)) / priceE18;
}

// ------------------------------------------------------------ mandate check

/** Mirror of PortfolioMandate.validate(): returns ALL violations (the contract reverts on the first). */
export function checkMandate(rules: MandateRules, allocs: Allocation[], values: Values): Violation[] {
  const t = total(values);
  if (t === 0n) return [];
  const out: Violation[] = [];
  const w = weightsBps(values);

  allocs.forEach((a, i) => {
    const bps = w[i];
    if (!a.isLiquid && bps > rules.maxSingleAssetBps)
      out.push({ code: "MAX_ALLOCATION_EXCEEDED", token: a.token, bps, limitBps: rules.maxSingleAssetBps });
    const registryMax = a.assetMaxBps ?? 10_000;
    if (bps > registryMax) out.push({ code: "MAX_ALLOCATION_EXCEEDED", token: a.token, bps, limitBps: registryMax });
    if (bps > a.maxBps) out.push({ code: "ALLOCATION_ABOVE_RANGE", token: a.token, bps, limitBps: a.maxBps });
    if (bps < a.minBps) out.push({ code: "ALLOCATION_BELOW_MIN", token: a.token, bps, limitBps: a.minBps });
  });

  const liq = liquidityBps(allocs, values);
  if (liq < rules.minLiquidityBps) out.push({ code: "MIN_LIQUIDITY_BREACHED", bps: liq, limitBps: rules.minLiquidityBps });
  return out;
}

// -------------------------------------------------------------------- risk

export function assessRisk(rules: MandateRules, allocs: Allocation[], values: Values): RiskAssessment {
  if (total(values) === 0n) {
    // Nothing deposited yet: nothing can drift or breach (matches the contract's early return).
    return { status: "OK", maxDriftBps: 0, liquidityBps: 0, largestPositionBps: 0, violations: [] };
  }
  const violations = checkMandate(rules, allocs, values);
  const drifts = driftBps(allocs, values).map(Math.abs);
  const maxDrift = drifts.length ? Math.max(...drifts) : 0;
  const w = weightsBps(values);
  const status: RiskStatus =
    violations.length > 0 ? "BREACH" : maxDrift > rules.rebalanceThresholdBps ? "DRIFT" : "OK";
  return {
    status,
    maxDriftBps: maxDrift,
    liquidityBps: liquidityBps(allocs, values),
    largestPositionBps: w.length ? Math.max(...w) : 0,
    violations,
  };
}

// --------------------------------------------------------------- rebalancing

function applySwap(values: Values, sell: number, buy: number, usd: bigint): Values {
  const next = values.slice();
  next[sell] -= usd;
  next[buy] += usd;
  return next;
}

/**
 * Smallest single swap that leaves the portfolio fully inside the mandate.
 * Tries (most-overweight -> most-underweight) pairs first and grows the trade in 0.5%-of-portfolio
 * steps, so the first hit is the minimum valid transition. Returns null if no single swap works
 * (caller can chain proposals) or if nothing needs doing.
 */
export function planRebalance(rules: MandateRules, allocs: Allocation[], values: Values): TradePlan | null {
  const risk = assessRisk(rules, allocs, values);
  if (risk.status === "OK") return null;

  const t = total(values);
  const drift = driftBps(allocs, values);
  const sellOrder = allocs.map((_, i) => i).sort((a, b) => drift[b] - drift[a]); // most overweight first
  const buyOrder = allocs.map((_, i) => i).sort((a, b) => drift[a] - drift[b]); // most underweight first
  const step = t / 200n; // 0.5% of portfolio
  if (step === 0n) return null;

  for (const s of sellOrder) {
    if (drift[s] <= 0) continue; // only sell positions above target
    for (const b of buyOrder) {
      if (b === s) continue;
      for (let k = 1n; k <= 200n; k++) {
        const usd = step * k;
        if (usd > values[s]) break;
        const next = applySwap(values, s, b, usd);
        if (checkMandate(rules, allocs, next).length === 0) {
          return {
            sellToken: allocs[s].token,
            buyToken: allocs[b].token,
            usdAmount: usd,
            reason: explain(rules, allocs, values, s, b, risk),
          };
        }
      }
    }
  }
  return null;
}

/** Plain-language "why", built from facts only (never "AI detected an opportunity"). */
function explain(rules: MandateRules, allocs: Allocation[], values: Values, s: number, b: number, risk: RiskAssessment): string {
  const w = weightsBps(values);
  const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
  const parts: string[] = [];
  for (const v of risk.violations) {
    const sym = allocs.find((a) => a.token === v.token)?.symbol ?? "Liquidity";
    if (v.code === "MAX_ALLOCATION_EXCEEDED")
      parts.push(`${sym} grew to ${pct(v.bps)} of your portfolio, above the ${pct(v.limitBps)} limit in your mandate.`);
    else if (v.code === "MIN_LIQUIDITY_BREACHED")
      parts.push(`Your liquidity reserve fell to ${pct(v.bps)}, below the ${pct(v.limitBps)} minimum you set.`);
    else if (v.code === "ALLOCATION_ABOVE_RANGE")
      parts.push(`${sym} moved above its approved range (${pct(v.bps)} vs ${pct(v.limitBps)} maximum).`);
    else parts.push(`${sym} fell below its approved range (${pct(v.bps)} vs ${pct(v.limitBps)} minimum).`);
  }
  if (parts.length === 0)
    parts.push(`Allocation drifted ${pct(risk.maxDriftBps)} from target, above your ${pct(rules.rebalanceThresholdBps)} rebalance threshold.`);
  parts.push(`Modalis moves the smallest amount needed from ${allocs[s].symbol} (${pct(w[s])}) into ${allocs[b].symbol} (${pct(w[b])}) to bring the portfolio back inside your mandate.`);
  return parts.join(" ");
}

/**
 * New money first: split a contribution across positions below target, proportional to their
 * shortfall. Avoids selling anything (fewer trades). Returns USD per allocation, same order.
 */
export function routeContribution(allocs: Allocation[], values: Values, contributionUsd: bigint): bigint[] {
  const newTotal = total(values) + contributionUsd;
  const deficits = allocs.map((a, i) => {
    const targetUsd = (newTotal * BigInt(a.targetBps)) / BPS;
    return targetUsd > values[i] ? targetUsd - values[i] : 0n;
  });
  const sumDeficit = deficits.reduce((x, y) => x + y, 0n);
  if (sumDeficit === 0n) {
    // Everything at/above target: follow target weights.
    return allocs.map((a) => (contributionUsd * BigInt(a.targetBps)) / BPS);
  }
  const scale = contributionUsd < sumDeficit ? contributionUsd : sumDeficit;
  const out = deficits.map((d) => (d * scale) / sumDeficit);
  // Distribute rounding dust to the largest deficit so the split sums to the contribution (when it fits).
  const assigned = out.reduce((x, y) => x + y, 0n);
  const dust = scale - assigned;
  if (dust > 0n) {
    const idx = deficits.indexOf(deficits.reduce((m, d) => (d > m ? d : m), 0n));
    out[idx] += dust;
  }
  return out;
}
