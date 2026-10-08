/** Input shapes shared by the goals routes. Validation here; meaning in the domain. */
import type { NewGoal } from "@modalis/domain";
import { isoDate, money, oneOf, text } from "@/lib/validate";

export const KINDS = [
  "house", "education", "long_term_wealth", "emergency_reserve", "retirement",
  "major_purchase", "travel", "custom",
] as const;
const CADENCES = ["weekly", "monthly", "quarterly"] as const;
const LIQUIDITY = ["none", "some", "significant"] as const;

export function newGoalFrom(body: Record<string, unknown>): NewGoal {
  return {
    kind: oneOf(body.kind, "the kind of goal", KINDS),
    name: text(body.name, "a name for the goal", { max: 80, required: true })!,
    targetValue: Number(money(body.targetValue, "a target", { max: 100_000_000 })),
    targetDate: isoDate(body.targetDate, "a date"),
    contributionAmount: body.contributionAmount === undefined ? 0 : Number(money(body.contributionAmount, "a regular amount", { max: 1_000_000 })),
    contributionCadence: body.contributionCadence === undefined ? "monthly" : oneOf(body.contributionCadence, "how often", CADENCES),
    liquidityNeed: body.liquidityNeed === undefined ? "some" : oneOf(body.liquidityNeed, "how reachable it must be", LIQUIDITY),
  };
}

export function goalPatchFrom(body: Record<string, unknown>) {
  const patch: Partial<Omit<NewGoal, "kind">> & { status?: "achieved" | "archived" } = {};
  if (body.name !== undefined) patch.name = text(body.name, "a name", { max: 80, required: true })!;
  if (body.targetValue !== undefined) patch.targetValue = Number(money(body.targetValue, "a target", { max: 100_000_000 }));
  if (body.targetDate !== undefined) patch.targetDate = isoDate(body.targetDate, "a date");
  if (body.contributionAmount !== undefined) patch.contributionAmount = Number(money(body.contributionAmount, "a regular amount", { max: 1_000_000 }));
  if (body.contributionCadence !== undefined) patch.contributionCadence = oneOf(body.contributionCadence, "how often", CADENCES);
  if (body.liquidityNeed !== undefined) patch.liquidityNeed = oneOf(body.liquidityNeed, "how reachable it must be", LIQUIDITY);
  if (body.status !== undefined) patch.status = oneOf(body.status, "the status", ["achieved", "archived"] as const);
  return patch;
}
