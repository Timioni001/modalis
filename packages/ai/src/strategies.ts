/**
 * The strategy registry (§13).
 *
 * A strategy is a structured, validated set of limits — never text an AI wrote. The planner
 * picks one by risk score and reads its limits from here; nothing else in the codebase decides
 * how concentrated or how tightly-banded a portfolio may be.
 *
 * These are exactly the bands the planner used before they lived in a table, so existing plans
 * are unchanged. `validateStrategies` is run by the tests and refuses a registry with a gap, an
 * overlap, or a limit the contract would reject.
 */
export type Strategy = {
  id: "preserve" | "cautious" | "balanced" | "growth";
  name: string;
  /** Inclusive risk-score range this strategy serves, 0-100. */
  scoreFrom: number;
  scoreTo: number;
  /** Most any single non-cash investment may hold. */
  maxSingleAssetBps: number;
  /** How far a holding may drift before an adjustment is suggested. Wider for more volatile mixes. */
  rebalanceThresholdBps: number;
  /** One line a person can read. */
  description: string;
};

export const STRATEGIES: readonly Strategy[] = [
  { id: "preserve", name: "Preserve", scoreFrom: 0, scoreTo: 19, maxSingleAssetBps: 1_500, rebalanceThresholdBps: 300, description: "Mostly steady holdings; small, tightly kept positions." },
  { id: "cautious", name: "Cautious", scoreFrom: 20, scoreTo: 34, maxSingleAssetBps: 2_000, rebalanceThresholdBps: 300, description: "Leans steady, with a modest share in growth." },
  { id: "balanced", name: "Balanced", scoreFrom: 35, scoreTo: 64, maxSingleAssetBps: 3_000, rebalanceThresholdBps: 400, description: "A mix of growth and steady holdings." },
  { id: "growth", name: "Growth", scoreFrom: 65, scoreTo: 100, maxSingleAssetBps: 4_000, rebalanceThresholdBps: 500, description: "More in growth, with wider bands so it doesn't churn." },
];

export function strategyFor(riskScore: number, registry: readonly Strategy[] = STRATEGIES): Strategy {
  const score = Math.min(100, Math.max(0, Math.round(riskScore)));
  const s = registry.find((x) => score >= x.scoreFrom && score <= x.scoreTo);
  if (!s) throw new Error(`No strategy covers risk score ${score}`);
  return s;
}

/** Problems with a registry, as sentences. Empty means it is sound. */
export function validateStrategies(registry: readonly Strategy[] = STRATEGIES): string[] {
  const problems: string[] = [];
  const sorted = [...registry].sort((a, b) => a.scoreFrom - b.scoreFrom);
  if (sorted[0]?.scoreFrom !== 0) problems.push("No strategy starts at score 0.");
  if (sorted[sorted.length - 1]?.scoreTo !== 100) problems.push("No strategy ends at score 100.");
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].scoreFrom !== sorted[i - 1].scoreTo + 1) problems.push(`Gap or overlap between ${sorted[i - 1].id} and ${sorted[i].id}.`);
  }
  for (const s of registry) {
    if (s.maxSingleAssetBps < 1 || s.maxSingleAssetBps > 10_000) problems.push(`${s.id}: max in one investment out of range.`);
    if (s.rebalanceThresholdBps < 1 || s.rebalanceThresholdBps > 10_000) problems.push(`${s.id}: drift threshold out of range.`);
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].maxSingleAssetBps < sorted[i - 1].maxSingleAssetBps) problems.push(`${sorted[i].id} allows less concentration than a lower-risk strategy.`);
  }
  return problems;
}
