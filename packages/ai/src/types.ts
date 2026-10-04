/**
 * The intelligence layer's data contract.
 *
 * Division of responsibility, which the rest of the system depends on:
 *
 *   - The INTERVIEW collects human answers.
 *   - The PROFILER turns behaviour into scores. Deterministic.
 *   - The ALLOCATION PLANNER turns scores + horizon into target weights. Deterministic.
 *   - The MANDATE BUILDER turns all of it into the exact parameters PortfolioMandate stores.
 *   - The LLM is used for two things only: reading a free-text goal into structured fields, and
 *     writing prose explanations. It never decides an allocation and never emits a contract call.
 *
 * Every number that reaches the chain comes from the deterministic path.
 */

export type GoalType =
  | "house"
  | "education"
  | "long_term_wealth"
  | "emergency_reserve"
  | "retirement"
  | "custom";

export type ContributionCadence = "weekly" | "monthly" | "quarterly";

/** How the user says they would react to a 12% drawdown. Behaviour, not jargon. */
export type DrawdownResponse = "sell_everything" | "sell_some" | "do_nothing" | "invest_more";

export type LiquidityNeed = "none" | "some" | "significant";

export type IncomeStability = "unstable" | "stable" | "very_stable";

export type InterviewAnswers = {
  goalType: GoalType;
  /** Free text, e.g. "enough for a deposit on a flat". Optional; parsed by the LLM when present. */
  goalDescription?: string;
  /** USD. */
  targetValue: number;
  /** USD already available to invest. */
  initialAmount: number;
  /** USD per cadence. */
  contributionAmount: number;
  contributionCadence: ContributionCadence;
  /** Months until the money is needed. */
  horizonMonths: number;
  drawdownResponse: DrawdownResponse;
  /** The largest peak-to-trough fall the user says they would accept, in percent. */
  maxTolerableDrawdownPct: number;
  liquidityNeed: LiquidityNeed;
  incomeStability: IncomeStability;
};

export type ParsedGoal = {
  goalType: GoalType;
  targetValue: number;
  horizonMonths: number;
  /** Set when the LLM parsed a free-text description rather than reading the form fields. */
  source: "interview" | "llm";
};

export type RiskProfile = {
  /** Willingness to take risk, 0-100, from behaviour and stated drawdown tolerance. */
  riskTolerance: number;
  /** Ability to take risk, 0-100, from horizon, income stability and funding headroom. */
  riskCapacity: number;
  /**
   * The score actually used. Deliberately the LOWER of tolerance and capacity: a willing investor
   * with a short horizon still should not hold a volatile portfolio.
   */
  riskScore: number;
  /** Liquidity that must stay in cash-like assets, in bps. */
  liquidityRequirementBps: number;
  /** Drawdown ceiling that becomes the mandate's maxDrawdownBps. */
  maxDrawdownBps: number;
  /** Plain-language summary of why these numbers came out as they did. */
  rationale: string[];
};

export type AssetClass = "growth" | "defensive" | "liquid";

/** An asset Modalis may allocate to, as registered in AssetRegistry. */
export type UniverseAsset = {
  token: string;
  symbol: string;
  decimals: number;
  assetClass: AssetClass;
  isLiquid: boolean;
  /** AssetRegistry's global per-asset ceiling, in bps. */
  assetMaxBps: number;
  /** Relative weight within its class. Higher gets more of the sleeve. */
  classWeight?: number;
};

export type PlannedAllocation = {
  token: string;
  symbol: string;
  isLiquid: boolean;
  targetBps: number;
  minBps: number;
  maxBps: number;
};

export type AllocationPlan = {
  allocations: PlannedAllocation[];
  growthBps: number;
  defensiveBps: number;
  liquidBps: number;
  /** The glide-path ceiling that applied at this horizon. */
  growthCeilingBps: number;
  rationale: string[];
};

/** Exactly the parameters PortfolioMandate.setMandate takes, plus display context. */
export type MandateDraft = {
  params: {
    targetValue: bigint; // USD 1e18
    targetDate: bigint; // unix seconds
    maxDrawdownBps: number;
    minLiquidityBps: number;
    rebalanceThresholdBps: number;
    maxSingleAssetBps: number;
    maxSlippageBps: number;
  };
  allocations: PlannedAllocation[];
  profile: RiskProfile;
  plan: AllocationPlan;
  goal: ParsedGoal;
  /** Monthly contribution in USD, for the dashboard. Not enforced on-chain. */
  monthlyContributionUsd: number;
};
