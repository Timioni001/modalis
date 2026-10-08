/**
 * Several goals, one portfolio.
 *
 * The contracts hold one plan per person, and that is the right boundary: limits protect money,
 * and money does not know which goal it is for. So goals share the portfolio, and this file is
 * the accounting that divides it between them.
 *
 * The rule is a PRIORITY WATERFALL (§6). Goals are ranked; the first is filled up to its target
 * before the second receives anything, and so on. Whatever exceeds every target is surplus, not
 * quietly credited to a goal. That makes the trade-off visible: when money is short, the person
 * can see exactly which goal is waiting and why, and change the order if they disagree.
 *
 * New money follows the same waterfall, so "where does this $500 go?" has one answer.
 *
 * Pure, bigint, deterministic. Each goal is then projected with the same zero-growth engine as a
 * single goal, using its own share and its own contribution.
 */
import { moneyFromE18, moneyInSentence, type Money } from "./models.ts";
import { healthLabel, project, type GoalHealth, type Projection } from "./projection.ts";

export type GoalSpec = {
  id: string;
  name: string;
  kind: string;
  /** 1 is funded first. */
  priority: number;
  targetE18: bigint;
  /** ISO date. */
  targetDate: string;
  /** What the person adds each month for THIS goal, at 1e18. */
  monthlyE18: bigint;
  liquidityNeed: "none" | "some" | "significant";
  /** ISO timestamp; breaks priority ties so order is always deterministic. */
  createdAt: string;
};

export type GoalShare = {
  goal: GoalSpec;
  /** The part of the portfolio this goal owns under the waterfall. */
  earmarkedE18: bigint;
  monthsRemaining: number;
  projection: Projection;
};

export type GoalBook = {
  shares: GoalShare[];
  /** Money beyond every goal's target. Belongs to the person, not to any goal. */
  surplusE18: bigint;
  totalE18: bigint;
};

const MONTH_MS = 30.4375 * 24 * 60 * 60 * 1000;

export function monthsBetween(now: Date, isoDate: string): number {
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((t - now.getTime()) / MONTH_MS));
}

/** Funding order: priority, then the older goal first. */
export function inPriorityOrder<T extends Pick<GoalSpec, "priority" | "createdAt">>(goals: T[]): T[] {
  return [...goals].sort(
    (a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt),
  );
}

/** Divides the portfolio's value between goals, highest priority first. */
export function allocateAcrossGoals(totalE18: bigint, goals: GoalSpec[], now = new Date()): GoalBook {
  let remaining = totalE18 > 0n ? totalE18 : 0n;
  const shares: GoalShare[] = [];

  for (const goal of inPriorityOrder(goals)) {
    const earmarkedE18 = remaining < goal.targetE18 ? remaining : goal.targetE18;
    remaining -= earmarkedE18;
    const monthsRemaining = monthsBetween(now, goal.targetDate);
    shares.push({
      goal,
      earmarkedE18,
      monthsRemaining,
      projection: project({
        savedE18: earmarkedE18,
        targetE18: goal.targetE18,
        monthlyE18: goal.monthlyE18,
        monthsRemaining,
      }),
    });
  }

  return { shares, surplusE18: remaining, totalE18 };
}

export type ContributionDestination = { goalId: string | null; name: string; amountE18: bigint };

/**
 * Where new money lands under the waterfall: the first goal still short of its target, then the
 * next. Anything left once every goal is full is surplus (goalId null).
 */
export function assignContribution(book: GoalBook, amountE18: bigint): ContributionDestination[] {
  let left = amountE18 > 0n ? amountE18 : 0n;
  const out: ContributionDestination[] = [];
  for (const share of book.shares) {
    if (left === 0n) break;
    const room = share.goal.targetE18 - share.earmarkedE18;
    if (room <= 0n) continue;
    const take = left < room ? left : room;
    out.push({ goalId: share.goal.id, name: share.goal.name, amountE18: take });
    left -= take;
  }
  if (left > 0n) out.push({ goalId: null, name: "Not assigned to a goal", amountE18: left });
  return out;
}

/** What the person sees for one goal. */
export type GoalCard = {
  id: string;
  name: string;
  kind: string;
  priority: number;
  target: Money;
  saved: Money;
  targetDate: string;
  monthsRemaining: number;
  monthly: Money;
  percentComplete: number;
  health: GoalHealth;
  healthLabel: string;
  /** One sentence, including the priority trade-off when it matters. */
  summary: string;
  liquidityNeed: GoalSpec["liquidityNeed"];
};

export function goalCards(book: GoalBook): GoalCard[] {
  return book.shares.map((s, i) => {
    const p = s.projection;
    const ahead = book.shares.slice(0, i).filter((x) => x.earmarkedE18 < x.goal.targetE18);
    let summary: string;
    if (s.earmarkedE18 === 0n && ahead.length > 0) {
      summary = `Waiting: ${ahead.map((a) => a.goal.name.toLowerCase()).join(" and ")} ${ahead.length === 1 ? "is" : "are"} funded first.`;
    } else if (p.shortfallE18 === 0n) {
      summary = s.earmarkedE18 >= s.goal.targetE18 ? "Fully funded." : "On track to arrive on time.";
    } else if (s.goal.monthlyE18 === 0n) {
      summary = `${moneyInSentence(p.shortfall)} still to find. Add a monthly amount to see when you'd arrive.`;
    } else {
      summary = `${moneyInSentence(p.shortfall)} short at this pace. About ${moneyInSentence(p.requiredMonthly)} a month gets you there.`;
    }
    return {
      id: s.goal.id,
      name: s.goal.name,
      kind: s.goal.kind,
      priority: i + 1,
      target: moneyFromE18(s.goal.targetE18, 0),
      saved: moneyFromE18(s.earmarkedE18),
      targetDate: s.goal.targetDate,
      monthsRemaining: s.monthsRemaining,
      monthly: moneyFromE18(s.goal.monthlyE18, 0),
      percentComplete: p.percentComplete,
      health: p.health,
      healthLabel: healthLabel(p.health),
      summary,
      liquidityNeed: s.goal.liquidityNeed,
    };
  });
}
