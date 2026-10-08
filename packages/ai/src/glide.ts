/**
 * The glide path (§8).
 *
 * As a goal's date approaches, more of its money has to be reachable: a fall a year out can be
 * waited through, a fall a month out cannot. This table is the ONE place that rule lives. The
 * planner uses it when it builds a plan, and the health engine uses it to notice when an
 * existing plan has been overtaken by the calendar — so a plan built today can never be told
 * it is wrong for today.
 *
 * Configurable by passing a different path; the default is what the planner has always used,
 * plus a final stage for the last six months.
 *
 * A glide step is never applied silently. When a plan falls behind its stage, the person is told
 * and asked to approve a new plan version. Modalis has no authority to change limits itself.
 */
export type GlideStage = {
  /** Applies when the goal is this many months away or fewer. */
  withinMonths: number;
  /** The least that must be easy to withdraw at this stage, in basis points. */
  minAvailableBps: number;
  /** A word for the stage, for the person. */
  name: string;
};

export const GLIDE_PATH: readonly GlideStage[] = [
  { withinMonths: 6, minAvailableBps: 5_000, name: "Protect" },
  { withinMonths: 12, minAvailableBps: 3_000, name: "Steady" },
  { withinMonths: 24, minAvailableBps: 1_500, name: "Balanced" },
];

/** The stage a goal this far away is in, or null when it is too far off for any. */
export function glideStage(monthsRemaining: number, path: readonly GlideStage[] = GLIDE_PATH): GlideStage | null {
  let match: GlideStage | null = null;
  for (const stage of path) {
    if (monthsRemaining <= stage.withinMonths && (!match || stage.minAvailableBps > match.minAvailableBps)) {
      match = stage;
    }
  }
  return match;
}

/** The liquidity floor the calendar requires, in bps. 0 when no stage applies. */
export function glideFloorBps(monthsRemaining: number, path: readonly GlideStage[] = GLIDE_PATH): number {
  return glideStage(monthsRemaining, path)?.minAvailableBps ?? 0;
}

/**
 * The other half of the glide path: the most a portfolio may hold in growth investments at a
 * given horizon, before any risk adjustment. Moved here from the planner so both halves of the
 * rule — less growth, more cash, as the date nears — live side by side.
 */
export const GROWTH_CEILING: readonly { fromMonths: number; maxGrowthBps: number }[] = [
  { fromMonths: 60, maxGrowthBps: 7_000 },
  { fromMonths: 36, maxGrowthBps: 6_000 },
  { fromMonths: 24, maxGrowthBps: 4_500 },
  { fromMonths: 12, maxGrowthBps: 3_000 },
  { fromMonths: 0, maxGrowthBps: 1_500 },
];

export function growthCeilingFor(horizonMonths: number): number {
  for (const step of GROWTH_CEILING) if (horizonMonths >= step.fromMonths) return step.maxGrowthBps;
  return GROWTH_CEILING[GROWTH_CEILING.length - 1].maxGrowthBps;
}
