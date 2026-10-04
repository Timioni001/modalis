/**
 * Risk profiler. Fully deterministic, and deliberately simple enough to explain to the user.
 *
 * Two separate ideas, which most products conflate:
 *   - risk TOLERANCE  = willingness. Behaviour under loss, plus the drawdown they say they accept.
 *   - risk CAPACITY   = ability. Horizon, income stability, and how much headroom the funding plan
 *                       has. A short horizon destroys capacity no matter how brave someone feels.
 *
 * The score we use is the LOWER of the two. That is the conservative choice and it is the one a
 * human adviser would defend.
 */
import type { InterviewAnswers, RiskProfile } from "./types.ts";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Behaviour under a 12% drawdown, scored 0-100. */
const DRAWDOWN_RESPONSE_SCORE: Record<InterviewAnswers["drawdownResponse"], number> = {
  sell_everything: 10,
  sell_some: 35,
  do_nothing: 70,
  invest_more: 90,
};

const INCOME_STABILITY_SCORE: Record<InterviewAnswers["incomeStability"], number> = {
  unstable: 20,
  stable: 60,
  very_stable: 85,
};

/** Liquidity floor in bps, before goal-type and horizon adjustments. */
const LIQUIDITY_NEED_BPS: Record<InterviewAnswers["liquidityNeed"], number> = {
  none: 500,
  some: 1000,
  significant: 2000,
};

export function profileRisk(a: InterviewAnswers): RiskProfile {
  const rationale: string[] = [];

  // ---------------------------------------------------------------- tolerance
  const behaviour = DRAWDOWN_RESPONSE_SCORE[a.drawdownResponse];
  // A stated tolerance of 30%+ reads as fully risk-tolerant; 0% as not at all.
  const stated = clamp((a.maxTolerableDrawdownPct / 30) * 100, 0, 100);
  const riskTolerance = Math.round(behaviour * 0.6 + stated * 0.4);
  rationale.push(
    `Willingness ${riskTolerance}/100: you said you would ${describeResponse(a.drawdownResponse)} in a downturn, ` +
      `and that a ${a.maxTolerableDrawdownPct}% fall is the most you would accept.`,
  );

  // ----------------------------------------------------------------- capacity
  // Horizon dominates: 60+ months is full capacity, under 12 months is near zero.
  const horizonScore = clamp((a.horizonMonths / 60) * 100, 0, 100);
  const incomeScore = INCOME_STABILITY_SCORE[a.incomeStability];
  // Funding headroom: how much of the target the plan covers with zero assumed growth. A plan that
  // already reaches the target does not need to take risk to get there.
  const planned = a.initialAmount + monthlyContribution(a) * a.horizonMonths;
  const fundingRatio = a.targetValue > 0 ? planned / a.targetValue : 1;
  const headroomScore = clamp((fundingRatio - 0.5) * 100, 0, 100);

  let riskCapacity = Math.round(horizonScore * 0.5 + incomeScore * 0.3 + headroomScore * 0.2);

  // An emergency reserve is capital that must be there on the day it is needed.
  if (a.goalType === "emergency_reserve") {
    riskCapacity = Math.min(riskCapacity, 20);
    rationale.push("Capacity capped at 20/100: an emergency reserve has to be available on demand.");
  }
  rationale.push(
    `Ability ${riskCapacity}/100: ${a.horizonMonths} months to go, ${a.incomeStability.replace("_", " ")} income, ` +
      `and your contributions cover ${Math.round(fundingRatio * 100)}% of the target before any growth.`,
  );

  // -------------------------------------------------------------------- score
  const riskScore = Math.min(riskTolerance, riskCapacity);
  rationale.push(
    riskTolerance <= riskCapacity
      ? `Using ${riskScore}/100, your willingness, because it is the lower of the two.`
      : `Using ${riskScore}/100, your ability, because it is the lower of the two.`,
  );

  // ---------------------------------------------------------------- liquidity
  let liquidityRequirementBps = LIQUIDITY_NEED_BPS[a.liquidityNeed];
  if (a.goalType === "emergency_reserve") liquidityRequirementBps = Math.max(liquidityRequirementBps, 5000);
  // Inside two years the money starts needing to be reachable.
  if (a.horizonMonths <= 24) liquidityRequirementBps = Math.max(liquidityRequirementBps, 1500);
  if (a.horizonMonths <= 12) liquidityRequirementBps = Math.max(liquidityRequirementBps, 3000);
  liquidityRequirementBps = clamp(liquidityRequirementBps, 500, 9000);
  rationale.push(`Liquidity reserve ${(liquidityRequirementBps / 100).toFixed(0)}% stays in cash-like assets.`);

  // ----------------------------------------------------------------- drawdown
  // Honour the stated ceiling, but never looser than the risk score justifies.
  const scoreImpliedBps = Math.round(500 + (riskScore / 100) * 2500); // 5% .. 30%
  const maxDrawdownBps = clamp(
    Math.min(Math.round(a.maxTolerableDrawdownPct * 100), scoreImpliedBps),
    300,
    5000,
  );
  rationale.push(`Drawdown limit ${(maxDrawdownBps / 100).toFixed(0)}%, the tighter of what you said and what your profile supports.`);

  return { riskTolerance, riskCapacity, riskScore, liquidityRequirementBps, maxDrawdownBps, rationale };
}

/** Contributions normalised to a monthly figure. */
export function monthlyContribution(a: InterviewAnswers): number {
  switch (a.contributionCadence) {
    case "weekly":
      return (a.contributionAmount * 52) / 12;
    case "quarterly":
      return a.contributionAmount / 3;
    default:
      return a.contributionAmount;
  }
}

function describeResponse(r: InterviewAnswers["drawdownResponse"]): string {
  switch (r) {
    case "sell_everything":
      return "sell everything";
    case "sell_some":
      return "sell some";
    case "do_nothing":
      return "hold";
    default:
      return "invest more";
  }
}
