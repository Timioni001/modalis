/**
 * "Can I afford this?" and inflation-adjusted targets.
 *
 * Both are arithmetic on numbers the person already has, with no market forecast:
 *
 *  - A purchase paid from the portfolio comes out of the goals in reverse funding order, because
 *    the waterfall fills the first goal first (packages/domain/src/goals.ts). Each goal that loses
 *    money is delayed by however many of its own monthly amounts it takes to win it back.
 *  - A target set in today's dollars needs more dollars later. At a steady yearly inflation rate,
 *    the target on the goal's date is target × (1 + rate)^years.
 */

export type GoalMoney = {
  id: string;
  name: string;
  /** Dollars. */
  saved: number;
  /** Dollars a month toward this goal. */
  monthly: number;
};

export type GoalHit = {
  id: string;
  name: string;
  /** Dollars this goal gives up. */
  takes: number;
  /** Extra months to win it back at the goal's monthly amount; null when it has none. */
  delayMonths: number | null;
};

export type Affordability = {
  hits: GoalHit[];
  /** Dollars the goals can't cover; the purchase is larger than everything saved. */
  uncovered: number;
};

/** @param goals in funding order, first-funded first. */
export function affordability(goals: GoalMoney[], purchase: number): Affordability {
  let left = Math.max(0, purchase);
  const hits: GoalHit[] = [];
  for (const g of [...goals].reverse()) {
    if (left <= 0) break;
    const takes = Math.min(Math.max(0, g.saved), left);
    if (takes <= 0) continue;
    left -= takes;
    hits.push({
      id: g.id,
      name: g.name,
      takes,
      delayMonths: g.monthly > 0 ? Math.ceil(takes / g.monthly) : null,
    });
  }
  return { hits, uncovered: Math.max(0, left) };
}

/** What a target set in today's dollars is in dollars on its date. */
export function inflatedTarget(target: number, months: number, yearlyRate: number): number {
  return target * Math.pow(1 + yearlyRate, Math.max(0, months) / 12);
}
