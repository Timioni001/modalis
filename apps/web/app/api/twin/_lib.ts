import { readPlanState, type PlanState } from "@modalis/chain";
import type { ScenarioRow } from "@modalis/db";
import {
  getGoal,
  getPlan,
  simulateTwin,
  compareTwins,
  DomainError,
  TWIN_RISK_PROFILES,
  type DomainContext,
  type TwinOutcome,
  type TwinRisk,
  type TwinScenarioInput,
} from "@modalis/domain";
import { usdStringToE18 } from "@modalis/domain";
import type { Address } from "viem";
import { integer, InvalidRequest, money, oneOf } from "@/lib/validate";

export type TwinCandidate = {
  target: string;
  months: number;
  monthly: string;
  withdrawal: string;
  risk: TwinRisk;
};

export type TwinSnapshot = {
  owner: Address;
  goalId: string | null;
  base: TwinScenarioInput;
  plan: Awaited<ReturnType<typeof getPlan>>;
  state: PlanState;
  /** False when the oracle cannot currently value the live portfolio. */
  valuationAvailable: boolean;
  /** Human-readable explanation shown beside the simulation. */
  balanceNote: string | null;
};

export type SavedTwinFuture = {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  candidate: TwinCandidate;
  selected: boolean;
};

function decimal(value: unknown, field: string, allowZero = false): string {
  if (typeof value === "number") throw new InvalidRequest(`Enter ${field} as an amount, like 500 or 500.00.`);
  if (typeof value !== "string" || !/^\d{1,12}(\.\d{1,18})?$/.test(value.trim())) {
    throw new InvalidRequest(`Enter ${field} as an amount, like 500 or 500.00.`);
  }
  const text = value.trim();
  if (!allowZero && BigInt(text.replace(".", "").replace(/^0+/, "") || "0") === 0n) {
    throw new InvalidRequest(`${field[0].toUpperCase()}${field.slice(1)} has to be more than zero.`);
  }
  if (Number(text) > 100_000_000) throw new InvalidRequest(`${field[0].toUpperCase()}${field.slice(1)} is larger than this deployment supports.`);
  return text;
}

export function candidateFromInput(raw: unknown): TwinCandidate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InvalidRequest("Choose a future before continuing.");
  const candidate = raw as Record<string, unknown>;
  return {
    target: money(candidate.target, "your target", { max: 100_000_000 }),
    months: integer(candidate.months, "your timeline", { min: 1, max: 600 }),
    monthly: decimal(candidate.monthly, "your monthly contribution", true),
    withdrawal: decimal(candidate.withdrawal ?? "0", "your withdrawal", true),
    risk: oneOf(candidate.risk, "your risk preference", ["cautious", "balanced", "adventurous"] as const),
  };
}

export function inputFromCandidate(candidate: TwinCandidate, startingE18: bigint): TwinScenarioInput {
  return {
    startingE18,
    targetE18: usdStringToE18(candidate.target),
    monthsRemaining: candidate.months,
    monthlyContributionE18: usdStringToE18(candidate.monthly),
    withdrawalE18: usdStringToE18(candidate.withdrawal),
    risk: candidate.risk,
  };
}

export function candidateFromInputValue(input: TwinScenarioInput): TwinCandidate {
  const asDollars = (value: bigint): string => {
    const whole = value / 10n ** 18n;
    const fraction = (value % 10n ** 18n).toString().padStart(18, "0").slice(0, 2);
    return `${whole}.${fraction}`;
  };
  return {
    target: asDollars(input.targetE18),
    months: input.monthsRemaining,
    monthly: asDollars(input.monthlyContributionE18),
    withdrawal: asDollars(input.withdrawalE18),
    risk: input.risk,
  };
}

export async function loadTwinSnapshot(ctx: DomainContext, owner: Address): Promise<TwinSnapshot> {
  // Reading a plan and its rules does not need portfolio prices. Keep Twin usable while an
  // oracle quote is stale, then make the limitation explicit instead of replacing the whole
  // experience with a generic error page.
  const [plan, state] = await Promise.all([
    getPlan(ctx, owner),
    readPlanState(ctx.client, ctx.deployment, owner),
  ]);
  let startingE18 = usdStringToE18(plan.goal.startingAmount.amount);
  let valuationAvailable = false;
  let balanceNote: string | null = "Live portfolio prices are unavailable. Twin is using the saved starting amount for this read-only comparison; no balance or transaction is invented.";
  try {
    const goal = await getGoal(ctx, owner);
    startingE18 = usdStringToE18(goal.saved.amount);
    valuationAvailable = true;
    balanceNote = null;
  } catch {
    // Stale prices and a temporarily unavailable valuation should not prevent editing a future.
    // The chain-backed plan above remains the source of truth for any approval.
  }
  const base: TwinScenarioInput = {
    startingE18,
    targetE18: usdStringToE18(plan.goal.target.amount),
    monthsRemaining: Math.max(1, plan.goal.monthsRemaining),
    monthlyContributionE18: usdStringToE18(plan.goal.contribution.amount.amount),
    withdrawalE18: 0n,
    risk: plan.riskLevel.level,
  };
  return { owner, goalId: plan.goal.id, base, plan, state, valuationAvailable, balanceNote };
}

/** Converts persisted history into the small shape the consumer UI needs. Invalid old rows are
 * ignored rather than allowed to break the Twin page. */
export function savedTwinFutureFromRow(row: ScenarioRow): SavedTwinFuture | null {
  if (!row.inputs || typeof row.inputs !== "object" || Array.isArray(row.inputs)) return null;
  const inputs = row.inputs as Record<string, unknown>;
  try {
    const candidate = candidateFromInput(inputs.alternative);
    const rawName = typeof inputs.name === "string" ? inputs.name.trim() : "";
    const result = row.result && typeof row.result === "object" && !Array.isArray(row.result)
      ? (row.result as Record<string, unknown>)
      : null;
    return {
      id: row.id,
      name: (rawName || row.prompt || "Saved plan").slice(0, 80),
      prompt: row.prompt,
      createdAt: row.created_at,
      candidate,
      selected: result?.selected === true,
    };
  } catch {
    return null;
  }
}

export function projectedResponse(snapshot: TwinSnapshot, alternative: TwinScenarioInput) {
  const comparison = compareTwins(snapshot.base, alternative);
  return {
    base: comparison.base,
    alternative: comparison.alternative,
    comparison,
    baseCandidate: candidateFromInputValue(snapshot.base),
    alternativeCandidate: candidateFromInputValue(alternative),
    assumption: "Twin is a read-only comparison. It uses deterministic fixed return paths to make trade-offs visible; it does not predict markets or move your money.",
  };
}

export function mandateForTwin(snapshot: TwinSnapshot, input: TwinScenarioInput, now = new Date()) {
  const profile = TWIN_RISK_PROFILES[input.risk];
  const date = new Date(now);
  date.setMonth(date.getMonth() + input.monthsRemaining);
  const targetDate = Math.floor(date.getTime() / 1000);
  const allocations = snapshot.state.positions.map((position) => ({
    token: position.token,
    targetBps: position.targetBps,
    minBps: position.minBps,
    maxBps: position.maxBps,
  }));
  if (allocations.length === 0 || allocations.reduce((sum, item) => sum + item.targetBps, 0) !== 10_000) {
    throw new DomainError("twin_not_approvable", "Your current allocation is unavailable, so this future cannot be approved yet.", 422);
  }
  const liquidTarget = snapshot.state.positions.reduce((sum, position) => sum + (position.isLiquid ? position.targetBps : 0), 0);
  const concentrated = snapshot.state.positions.find((position) => !position.isLiquid && position.targetBps > profile.maxSingleAssetBps);
  if (concentrated) {
    throw new DomainError("twin_not_approvable", `${profile.label} guardrails allow at most ${profile.maxSingleAssetBps / 100}% in one investment, but ${concentrated.symbol} is currently ${concentrated.targetBps / 100}%. Adjust the allocation first.`, 422);
  }
  if (liquidTarget < profile.minLiquidityBps) {
    throw new DomainError("twin_not_approvable", `${profile.label} guardrails need at least ${profile.minLiquidityBps / 100}% available cash, while this plan currently targets ${liquidTarget / 100}%. Adjust the allocation first.`, 422);
  }
  const params = {
    targetValue: input.targetE18,
    targetDate: BigInt(targetDate),
    maxDrawdownBps: profile.maxDrawdownBps,
    minLiquidityBps: profile.minLiquidityBps,
    rebalanceThresholdBps: profile.rebalanceThresholdBps,
    maxSingleAssetBps: profile.maxSingleAssetBps,
    maxSlippageBps: snapshot.state.mandate.maxSlippageBps,
  };
  return { params, allocations, targetDate };
}

export function checkTwinReceiptParams(
  snapshot: TwinSnapshot,
  input: TwinScenarioInput,
  params: { targetValue: bigint; targetDate: bigint; maxDrawdownBps: number; minLiquidityBps: number; rebalanceThresholdBps: number; maxSingleAssetBps: number; maxSlippageBps: number },
  allocations: readonly { token: Address; targetBps: number; minBps: number; maxBps: number }[],
  now = new Date(),
): void {
  const profile = TWIN_RISK_PROFILES[input.risk];
  const expectedDate = new Date(now);
  expectedDate.setMonth(expectedDate.getMonth() + input.monthsRemaining);
  const min = BigInt(Math.floor((expectedDate.getTime() - 32 * 86_400_000) / 1000));
  const max = BigInt(Math.ceil((expectedDate.getTime() + 32 * 86_400_000) / 1000));
  if (params.targetValue !== input.targetE18 || params.targetDate < min || params.targetDate > max) throw new DomainError("twin_receipt_mismatch", "That receipt does not match the future you chose.", 400);
  if (Number(params.maxDrawdownBps) !== profile.maxDrawdownBps || Number(params.minLiquidityBps) !== profile.minLiquidityBps || Number(params.rebalanceThresholdBps) !== profile.rebalanceThresholdBps || Number(params.maxSingleAssetBps) !== profile.maxSingleAssetBps || Number(params.maxSlippageBps) !== snapshot.state.mandate.maxSlippageBps) throw new DomainError("twin_receipt_mismatch", "That receipt does not match the guardrails you reviewed.", 400);
  if (allocations.length !== snapshot.state.positions.length || allocations.some((item, index) => {
    const expected = snapshot.state.positions[index];
    return item.token.toLowerCase() !== expected.token.toLowerCase() || Number(item.targetBps) !== expected.targetBps || Number(item.minBps) !== expected.minBps || Number(item.maxBps) !== expected.maxBps;
  })) throw new DomainError("twin_receipt_mismatch", "That receipt does not match the allocation you reviewed.", 400);
}

export function outcomeFor(input: TwinScenarioInput): TwinOutcome {
  return simulateTwin(input);
}
