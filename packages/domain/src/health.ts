/**
 * Portfolio health.
 *
 * One answer to "does anything need my attention?", built from facts the system already holds:
 * the person's own limits, where their money actually sits, and where their goal is heading.
 *
 * Every reason carries the EVIDENCE it was derived from — the two numbers being compared — so an
 * explanation can never say more than the data does. "Your largest investment is 33%, above your
 * 30% limit" is a reason. "Your portfolio looks risky" is not, and cannot be produced here.
 *
 * Pure and deterministic: the same inputs always give the same answer, on the server or in the
 * browser, which is what lets the screen and the explanation agree.
 */
import { moneyInSentence, type Money, type PlanRules } from "./models.ts";
import type { GoalHealth } from "./projection.ts";
import { glideStage } from "@modalis/ai";

export type HealthState = "healthy" | "watch" | "action_required" | "restricted";

export type HealthReasonCode =
  | "plan_paused"
  | "not_funded"
  | "over_single_limit"
  | "near_single_limit"
  | "below_available_floor"
  | "drift_past_limit"
  | "drift_building"
  | "goal_off_track"
  | "goal_behind"
  | "target_date_close"
  | "glide_step_due";

/** A fact a reason rests on, in words and figures. */
export type Evidence = { label: string; value: string };

export type HealthReason = {
  code: HealthReasonCode;
  /** How much this one reason weighs on its own. */
  severity: Exclude<HealthState, "healthy">;
  message: string;
  evidence: Evidence[];
};

export type Health = {
  state: HealthState;
  /** Two or three words, for a badge. */
  label: string;
  /** One sentence: the most important reason, or the all-clear. */
  headline: string;
  reasons: HealthReason[];
};

export type HealthInput = {
  planStatus: "active" | "paused" | "draft";
  rules: PlanRules;
  /**
   * Undefined means the balance is not known yet. That is NOT the same as empty: an unknown
   * balance makes no claim, where treating it as empty would tell someone their plan holds $0.
   */
  moneyEmpty: boolean | undefined;
  allocation?: {
    furthestOffTargetPercent: number;
    largestHoldingPercent: number;
    availableMoneyPercent: number;
  };
  goal?: {
    health: GoalHealth;
    shortfall: Money;
    requiredMonthly: Money;
    monthsRemaining: number;
    percentComplete: number;
  };
};

const RANK: Record<HealthState, number> = { healthy: 0, watch: 1, action_required: 2, restricted: 3 };

/** Drift counts as "building" once three-quarters of the allowed room is used. */
const NEAR = 0.75;

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

export function assessHealth(input: HealthInput): Health {
  const reasons: HealthReason[] = [];
  const { rules } = input;

  if (input.planStatus === "paused") {
    reasons.push({
      code: "plan_paused",
      severity: "restricted",
      message: "Your plan is paused, so Modalis won't make any changes. You can still withdraw.",
      evidence: [{ label: "Plan", value: "Paused" }],
    });
  }

  if (input.moneyEmpty === true) {
    reasons.push({
      code: "not_funded",
      severity: "action_required",
      message: "There's no money in your plan yet. Add some and Modalis starts managing it.",
      evidence: [{ label: "In your plan", value: "$0" }],
    });
  }

  const a = input.allocation;
  if (a && input.moneyEmpty === false) {
    if (a.largestHoldingPercent > rules.maxInOneInvestmentPercent) {
      reasons.push({
        code: "over_single_limit",
        severity: "action_required",
        message: `Your largest investment is ${pct(a.largestHoldingPercent)}, above your ${pct(rules.maxInOneInvestmentPercent)} limit.`,
        evidence: [
          { label: "Largest investment", value: pct(a.largestHoldingPercent) },
          { label: "Your limit", value: pct(rules.maxInOneInvestmentPercent) },
        ],
      });
    } else if (a.largestHoldingPercent >= rules.maxInOneInvestmentPercent * 0.9) {
      // Within a tenth of the limit. Further out, the biggest holding is just the biggest one.
      reasons.push({
        code: "near_single_limit",
        severity: "watch",
        message: `Your largest investment is ${pct(a.largestHoldingPercent)}, close to your ${pct(rules.maxInOneInvestmentPercent)} limit.`,
        evidence: [
          { label: "Largest investment", value: pct(a.largestHoldingPercent) },
          { label: "Your limit", value: pct(rules.maxInOneInvestmentPercent) },
        ],
      });
    }

    if (a.availableMoneyPercent < rules.moneyKeptAvailablePercent) {
      reasons.push({
        code: "below_available_floor",
        severity: "action_required",
        message: `Only ${pct(a.availableMoneyPercent)} is easy to withdraw. Your plan keeps at least ${pct(rules.moneyKeptAvailablePercent)}.`,
        evidence: [
          { label: "Easy to withdraw", value: pct(a.availableMoneyPercent) },
          { label: "Your minimum", value: pct(rules.moneyKeptAvailablePercent) },
        ],
      });
    }

    if (a.furthestOffTargetPercent > rules.adjustWhenOffTargetByPercent) {
      reasons.push({
        code: "drift_past_limit",
        severity: "action_required",
        message: `Something has moved ${pct(a.furthestOffTargetPercent)} from where your plan wants it — more than the ${pct(rules.adjustWhenOffTargetByPercent)} you allowed.`,
        evidence: [
          { label: "Furthest off target", value: pct(a.furthestOffTargetPercent) },
          { label: "You allowed", value: pct(rules.adjustWhenOffTargetByPercent) },
        ],
      });
    } else if (a.furthestOffTargetPercent >= rules.adjustWhenOffTargetByPercent * NEAR) {
      reasons.push({
        code: "drift_building",
        severity: "watch",
        message: `Your money is still inside your plan, but something has moved ${pct(a.furthestOffTargetPercent)} from target. Modalis steps in at ${pct(rules.adjustWhenOffTargetByPercent)}.`,
        evidence: [
          { label: "Furthest off target", value: pct(a.furthestOffTargetPercent) },
          { label: "Steps in at", value: pct(rules.adjustWhenOffTargetByPercent) },
        ],
      });
    }
  }

  const g = input.goal;
  if (g && input.moneyEmpty === false) {
    if (g.health === "off_track") {
      reasons.push({
        code: "goal_off_track",
        severity: "action_required",
        message: `At this pace you'd finish ${moneyInSentence(g.shortfall)} short. About ${moneyInSentence(g.requiredMonthly)} a month would get you there.`,
        evidence: [
          { label: "Still to find", value: moneyInSentence(g.shortfall) },
          { label: "Needed each month", value: moneyInSentence(g.requiredMonthly) },
        ],
      });
    } else if (g.health === "needs_attention") {
      reasons.push({
        code: "goal_behind",
        severity: "watch",
        message: `You're slightly behind. About ${moneyInSentence(g.requiredMonthly)} a month keeps your goal on time.`,
        evidence: [{ label: "Needed each month", value: moneyInSentence(g.requiredMonthly) }],
      });
    }

    // The calendar has moved the plan into a steadier stage than the one it was built for. Told,
    // never applied: only the person can change their limits.
    const stage = glideStage(g.monthsRemaining);
    if (stage && rules.moneyKeptAvailablePercent * 100 < stage.minAvailableBps) {
      const need = stage.minAvailableBps / 100;
      reasons.push({
        code: "glide_step_due",
        severity: "watch",
        message: `Your goal is ${g.monthsRemaining} month${g.monthsRemaining === 1 ? "" : "s"} away. Plans this close keep at least ${pct(need)} easy to withdraw; yours keeps ${pct(rules.moneyKeptAvailablePercent)}. Updating your plan would protect what you've built.`,
        evidence: [
          { label: "Kept available now", value: pct(rules.moneyKeptAvailablePercent) },
          { label: `${stage.name} stage needs`, value: pct(need) },
        ],
      });
    }

    if (g.monthsRemaining > 0 && g.monthsRemaining <= 6 && g.percentComplete < 100) {
      reasons.push({
        code: "target_date_close",
        severity: "watch",
        message: `Your target date is ${g.monthsRemaining} month${g.monthsRemaining === 1 ? "" : "s"} away.`,
        evidence: [
          { label: "Time left", value: `${g.monthsRemaining} months` },
          { label: "Reached so far", value: pct(g.percentComplete) },
        ],
      });
    }
  }

  // Most serious first, so the headline is always the thing that matters most.
  reasons.sort((x, y) => RANK[y.severity] - RANK[x.severity]);
  const state = reasons.reduce<HealthState>(
    (worst, r) => (RANK[r.severity] > RANK[worst] ? r.severity : worst),
    "healthy",
  );

  return {
    state,
    label: LABELS[state],
    headline: reasons[0]?.message ?? "Everything is inside your plan. Nothing needs you.",
    reasons,
  };
}

const LABELS: Record<HealthState, string> = {
  healthy: "All good",
  watch: "Worth a look",
  action_required: "Needs you",
  restricted: "Paused",
};
