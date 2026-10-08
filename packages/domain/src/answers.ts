/**
 * Ask Modalis.
 *
 * Answers the eight questions a person actually has about their money — my goal, my plan, my
 * money, how am I doing, does anything need me, why, what happens if I approve, what can Modalis
 * do — from the facts the system already holds.
 *
 * There is no language model in this path. That is deliberate: every sentence here is assembled
 * from structured data, and every answer returns the evidence it used. A model may later reword
 * these answers, but it must not be the source of them — an assistant that can invent a balance
 * or a limit is worse than no assistant.
 *
 * Questions outside the eight get an honest "I can't answer that" and the list of what it can.
 */
import { assessHealth, type Evidence, type Health, type HealthInput } from "./health.ts";
import { moneyInSentence, type Adjustment, type MoneyView, type Plan } from "./models.ts";
import type { GoalView } from "./services/goal.ts";

export type Intent =
  | "my_goal"
  | "my_plan"
  | "my_money"
  | "how_am_i_doing"
  | "needs_attention"
  | "why_change"
  | "if_i_approve"
  | "what_can_modalis_do";

/** The questions offered as one-tap suggestions, in the order people tend to ask them. */
export const SUGGESTED_QUESTIONS: { intent: Intent; question: string }[] = [
  { intent: "how_am_i_doing", question: "How am I doing?" },
  { intent: "needs_attention", question: "Does anything need me?" },
  { intent: "my_money", question: "Where is my money?" },
  { intent: "my_plan", question: "Why is my money invested this way?" },
  { intent: "why_change", question: "Why does something need to change?" },
  { intent: "if_i_approve", question: "What happens if I approve?" },
  { intent: "what_can_modalis_do", question: "What can Modalis do with my money?" },
  { intent: "my_goal", question: "What is my goal?" },
];

export type Facts = {
  goal?: GoalView | null;
  plan?: Plan | null;
  money?: MoneyView | null;
  adjustment?: Adjustment | null;
  allocation?: HealthInput["allocation"];
};

export type Answer = {
  intent: Intent | "unknown";
  text: string;
  /** The figures the answer rests on. Empty only when the answer is about having no data. */
  evidence: Evidence[];
};

/**
 * Words that point at each question. Checked in order, most specific first, so "why should I
 * approve this" lands on approval rather than on the generic "why".
 */
const ROUTES: [Intent, RegExp][] = [
  ["if_i_approve", /\b(approve|approval|accept|confirm|go ahead|happens if)\b/i],
  ["what_can_modalis_do", /\b(can modalis|allowed|permission|control|withdraw|steal|access|trust|safe)\b/i],
  ["why_change", /\b(why.*(change|adjust|move|sell)|adjust|rebalanc|drift)\b/i],
  ["needs_attention", /\b(attention|need(s)? me|anything (wrong|to do)|problem|issue|alert|health)\b/i],
  ["my_money", /\b(where.*money|holdings?|invested in|balance|how much (do i|have)|spread)\b/i],
  ["my_plan", /\b(plan|why.*invested|strategy|limits?|rules?|risk)\b/i],
  ["how_am_i_doing", /\b(how am i|on track|progress|doing|behind|ahead|get there|reach)\b/i],
  ["my_goal", /\b(goal|saving for|target)\b/i],
];

export function classify(question: string): Intent | "unknown" {
  for (const [intent, pattern] of ROUTES) if (pattern.test(question)) return intent;
  return "unknown";
}

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

function healthOf(f: Facts): Health | null {
  if (!f.plan) return null;
  return assessHealth({
    planStatus: f.plan.status,
    rules: f.plan.rules,
    moneyEmpty: f.money ? f.money.isEmpty : undefined,
    allocation: f.allocation,
    goal: f.goal
      ? {
          health: f.goal.health,
          shortfall: f.goal.projection.shortfall,
          requiredMonthly: f.goal.projection.requiredMonthly,
          monthsRemaining: f.goal.goal.monthsRemaining,
          percentComplete: f.goal.projection.percentComplete,
        }
      : undefined,
  });
}

export function answer(question: string, facts: Facts): Answer {
  return answerIntent(classify(question), facts);
}

export function answerIntent(intent: Intent | "unknown", f: Facts): Answer {
  if (intent === "unknown") {
    return {
      intent,
      text:
        "I can only answer questions about your goal, your plan and your money, from the figures " +
        "Modalis actually holds. Try one of the suggestions.",
      evidence: [],
    };
  }

  if (!f.plan && intent !== "what_can_modalis_do") {
    return {
      intent,
      text: "You don't have a plan yet, so there's nothing to report. Build one and I can answer this.",
      evidence: [],
    };
  }

  switch (intent) {
    case "my_goal": {
      const g = f.goal ?? null;
      if (!g) return { intent, text: "I can't read your goal right now.", evidence: [] };
      return {
        intent,
        text: `${g.goal.name}: ${moneyInSentence(g.goal.target)} by ${monthYear(g.goal.targetDate)}.`,
        evidence: [
          { label: "Target", value: moneyInSentence(g.goal.target) },
          { label: "Needed by", value: monthYear(g.goal.targetDate) },
          { label: "Time left", value: `${g.goal.monthsRemaining} months` },
        ],
      };
    }

    case "how_am_i_doing": {
      const g = f.goal ?? null;
      if (!g) return { intent, text: "I can't read your progress right now.", evidence: [] };
      return {
        intent,
        text: `${g.healthLabel}. ${g.summary}`,
        evidence: [
          { label: "In your plan", value: moneyInSentence(g.saved) },
          { label: "Of your goal", value: pct(g.projection.percentComplete) },
          { label: "Still to find", value: moneyInSentence(g.projection.shortfall) },
        ],
      };
    }

    case "needs_attention": {
      const h = healthOf(f)!;
      if (h.reasons.length === 0) {
        return { intent, text: h.headline, evidence: [{ label: "Plan health", value: h.label }] };
      }
      return {
        intent,
        text: h.reasons.map((r) => r.message).join(" "),
        evidence: h.reasons.flatMap((r) => r.evidence),
      };
    }

    case "my_money": {
      const m = f.money;
      if (!m) return { intent, text: "I can't read your balances right now. Try again in a moment.", evidence: [] };
      if (m.isEmpty) {
        return { intent, text: "There's no money in your plan yet.", evidence: [{ label: "In your plan", value: "$0" }] };
      }
      const parts = m.holdings.map((h) => `${pct(h.sharePercent)} in ${h.name}`);
      return {
        intent,
        text: `You have ${moneyInSentence(m.total)}: ${parts.join(", ")}. ${moneyInSentence(m.available)} of it is easy to withdraw.`,
        evidence: m.holdings.map((h) => ({ label: h.name, value: `${moneyInSentence(h.value)} · ${pct(h.sharePercent)}` })),
      };
    }

    case "my_plan": {
      const p = f.plan!;
      const reasons = p.riskLevel.reasons.slice(0, 2).join(" ");
      return {
        intent,
        text: `${p.summary}${reasons ? ` ${reasons}` : ""}`,
        evidence: [
          { label: "Most you'd lose", value: pct(p.rules.comfortableLosingPercent) },
          { label: "Kept available", value: pct(p.rules.moneyKeptAvailablePercent) },
          { label: "Max in one thing", value: pct(p.rules.maxInOneInvestmentPercent) },
          { label: "Steps in when off by", value: pct(p.rules.adjustWhenOffTargetByPercent) },
        ],
      };
    }

    case "why_change": {
      const a = f.adjustment;
      if (!a || a.status === "none_needed") {
        return {
          intent,
          text: "Nothing needs to change. Your money is inside every limit you set.",
          evidence: [{ label: "Suggested changes", value: "None" }],
        };
      }
      return {
        intent,
        text: a.explanation,
        evidence: a.reasons.map((r) => ({
          label: r.holdingName ?? "Your plan",
          value: `${pct(r.currentPercent)} now · limit ${pct(r.limitPercent)}`,
        })),
      };
    }

    case "if_i_approve": {
      const a = f.adjustment;
      if (!a || a.status === "none_needed" || !a.change) {
        return {
          intent,
          text: "There's nothing waiting for your approval.",
          evidence: [{ label: "Waiting for you", value: "Nothing" }],
        };
      }
      if (!a.allowedByYourRules) {
        return {
          intent,
          text: `Nothing — your own rules refuse this change${a.blockedBecause ? ` (${a.blockedBecause})` : ""}, so it can't go ahead and your money stays where it is.`,
          evidence: [{ label: "Your rules", value: "Refused" }],
        };
      }
      return {
        intent,
        text:
          `Modalis moves ${a.change.sell.amount} ${a.change.sell.name} into at least ` +
          `${a.change.buy.atLeast} ${a.change.buy.name}. The contract holding your limits checks it ` +
          `again at the moment it runs, and you get a receipt you can look up yourself.`,
        evidence: [
          { label: "Out of", value: `${a.change.sell.amount} ${a.change.sell.name}` },
          { label: "Into, at least", value: `${a.change.buy.atLeast} ${a.change.buy.name}` },
          { label: "Your rules", value: "Allow it" },
        ],
      };
    }

    case "what_can_modalis_do": {
      return {
        intent,
        text:
          "Modalis can suggest a change when your money drifts, and carry out one you approve — " +
          "inside your limits. It cannot send your money anywhere you didn't approve, go past a " +
          "limit, act while your plan is paused, or change your limits. Only you can withdraw, " +
          "and that keeps working even while paused.",
        evidence: [
          { label: "Withdraw your money", value: "Only you" },
          { label: "Change your limits", value: "Only you" },
          { label: "Act while paused", value: "Never" },
        ],
      };
    }
  }
}

function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
