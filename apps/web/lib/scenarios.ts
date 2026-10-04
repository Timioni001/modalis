/**
 * Scenario ("What if?") helpers.
 *
 * Deliberately return-free: every figure assumes ZERO investment growth, so the answer to "will
 * I get there?" is framed as "here is what your own contributions cover", never as a projected
 * return. Presenting a projection as a promise is out of bounds for this product.
 */
import { contributionGapMonthly } from "@modalis/portfolio";
import { buildMandateDraft, monthlyContribution, usdToE18, type InterviewAnswers, type MandateDraft } from "@modalis/ai";

export { buildMandateDraft };
export type { InterviewAnswers, MandateDraft };

export type FundingView = {
  /** USD 1e18 the plan contributes by the target date, with no growth assumed. */
  plannedTotalE18: bigint;
  targetValueE18: bigint;
  /** Contribution per month needed to reach the target with no growth. */
  requiredMonthlyE18: bigint;
  /** How far the current contribution falls short per month, if at all. */
  gapMonthlyE18: bigint;
  /** Share of the target the plan covers, in bps, with no growth assumed. */
  coverageBps: number;
};

export function contributionGapForDraft(answers: InterviewAnswers, draft: MandateDraft): FundingView {
  const monthly = usdToE18(monthlyContribution(answers));
  const initial = usdToE18(answers.initialAmount);
  const target = draft.params.targetValue;
  const months = answers.horizonMonths;

  const planned = initial + monthly * BigInt(months);
  const { requiredMonthly, gapMonthly } = contributionGapMonthly(initial, target, months, monthly);

  return {
    plannedTotalE18: planned,
    targetValueE18: target,
    requiredMonthlyE18: requiredMonthly,
    gapMonthlyE18: gapMonthly,
    coverageBps: target === 0n ? 0 : Number((planned * 10_000n) / target),
  };
}
