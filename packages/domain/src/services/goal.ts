/**
 * The goal — the thing the whole product is organised around.
 *
 * A goal lives in two places and neither is complete alone. The CHAIN holds the target amount and
 * the date, because those bound what Modalis may do and have to be enforceable. The DATABASE holds
 * what a contract has no business storing: what the person called it, what they said they could
 * add each month, and how often.
 *
 * So this service reads both and degrades honestly: with no database the goal still works, it is
 * just unnamed and its contribution reads as zero — and a zero contribution produces "we can't
 * tell you when you'll arrive" rather than a guess.
 */
import { readPortfolio } from "@modalis/chain";
import { getAddress, type Address } from "viem";
import {
  activeMandate,
  findUserByWallet,
  latestGoal,
  listGoals,
  type GoalRow,
} from "@modalis/db";
import { DomainError, type DomainContext } from "../context.ts";
import { monthsUntil, toGoal } from "../translate.ts";
import {
  moneyFromE18,
  moneyInSentence,
  type Goal,
  type Money,
} from "../models.ts";
import { allocateAcrossGoals, type GoalSpec } from "../goals.ts";
import {
  defaultScenarios,
  healthLabel,
  project,
  runScenario,
  type GoalHealth,
  type Projection,
  type ProjectionInputs,
  type Scenario,
  type ScenarioResult,
} from "../projection.ts";

const E18 = 10n ** 18n;
import { savedSavings } from "./savings.ts";

/** A goal plus the answer to "am I going to get there?". */
export type GoalView = {
  goal: Goal;
  /** What they have in the plan now. */
  saved: Money;
  health: GoalHealth;
  /** The three-word label, so a UI never has to map the codes itself. */
  healthLabel: string;
  /** One sentence a person can act on. */
  summary: string;
  /** Where they would land on the target date, assuming no growth. */
  projection: Projection;
  /** True when the contribution is unknown, so every forward figure is a floor rather than a path. */
  contributionUnknown: boolean;
};

/** A stored cadence, narrowed. An unrecognised value reads as monthly rather than throwing. */
function cadenceOf(
  value: string | null | undefined,
): "weekly" | "monthly" | "quarterly" {
  return value === "weekly" || value === "quarterly" ? value : "monthly";
}

/** A stored goal row, as the goal engine's input. */
export function specFromRow(row: GoalRow): GoalSpec {
  const cadence =
    row.contribution_cadence === "weekly" ||
    row.contribution_cadence === "quarterly"
      ? row.contribution_cadence
      : "monthly";
  return {
    id: row.id,
    name: row.name,
    kind: row.type,
    priority: row.priority ?? 1,
    targetE18: usdToE18(Number(row.target_value)),
    targetDate: row.target_date,
    monthlyE18: usdToE18(monthlyFrom(Number(row.contribution_amount), cadence)),
    liquidityNeed: row.liquidity_need ?? "some",
    createdAt: row.created_at,
  };
}

/** Monthly equivalent of a contribution at whatever cadence it was given. */
export function monthlyFrom(
  amount: number,
  cadence: "weekly" | "monthly" | "quarterly",
): number {
  if (cadence === "weekly") return (amount * 52) / 12;
  if (cadence === "quarterly") return amount / 3;
  return amount;
}

/** Dollars -> 1e18, through a string so no float rounding is introduced. */
export function usdToE18(dollars: number): bigint {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0n;
  const [whole, frac = "0"] = dollars.toFixed(6).split(".");
  return BigInt(whole) * E18 + BigInt(frac.padEnd(18, "0"));
}

/** What the person said they'd add each month, or zero when we have no record of it. */
export async function monthlyContributionE18(
  ctx: DomainContext,
  owner: Address,
): Promise<bigint> {
  if (!ctx.db) return 0n;
  const user = await findUserByWallet(ctx.db, owner);
  if (!user) return 0n;
  const goal = await latestGoal(ctx.db, user.id);
  if (!goal) return 0n;
  return usdToE18(
    monthlyFrom(
      Number(goal.contribution_amount),
      cadenceOf(goal.contribution_cadence),
    ),
  );
}

/** The inputs a projection needs, assembled from the chain and the database. */
async function inputsFor(
  ctx: DomainContext,
  owner: Address,
  now: Date,
): Promise<{
  inputs: ProjectionInputs;
  goal: Goal;
  contributionUnknown: boolean;
}> {
  const who = getAddress(owner);
  const state = await readPortfolio(ctx.client, ctx.deployment, who);
  if (!state.hasMandate) {
    throw new DomainError(
      "no_plan",
      "You don't have a plan yet, so there's no goal to show.",
      404,
    );
  }

  const monthlyE18 = await monthlyContributionE18(ctx, who);
  let goal = toGoal({
    kind: "custom",
    name: "Your goal",
    targetE18: state.mandate.targetValue,
    targetDateUnix: state.mandate.targetDate,
    startingAmountE18: 0n,
    contributionE18: monthlyE18,
    cadence: "monthly",
    now,
  });

  // Give the goal its name back when we have one. The chain cannot hold "A home in Lisbon".
  // With several goals, the one shown is the one the PLAN was built for — not simply the newest,
  // which would silently switch the overview to whatever goal was added last.
  let savedE18 = state.totalValueE18;
  if (ctx.db) {
    const user = await findUserByWallet(ctx.db, who);
    const [rows, mandate] = user
      ? await Promise.all([
          listGoals(ctx.db, user.id),
          activeMandate(ctx.db, user.id),
        ])
      : [[] as GoalRow[], null];
    const stored =
      rows.find((r) => r.id === mandate?.goal_id) ??
      (user ? await latestGoal(ctx.db, user.id) : null);

    if (stored && rows.length > 1) {
      // Several goals share the portfolio: this goal owns its waterfall share, not all of it.
      const specs: GoalSpec[] = rows.map((r) =>
        r.id === stored.id
          ? { ...specFromRow(r), targetE18: state.mandate.targetValue }
          : specFromRow(r),
      );
      const share = allocateAcrossGoals(
        state.totalValueE18,
        specs,
        now,
      ).shares.find((x) => x.goal.id === stored.id);
      if (share) savedE18 = share.earmarkedE18;
    }

    if (stored) {
      goal = {
        ...goal,
        id: stored.id,
        kind: stored.type ?? goal.kind,
        name: stored.name ?? goal.name,
        startingAmount: moneyFromE18(
          usdToE18(Number(stored.initial_amount ?? 0)),
          0,
        ),
        savings: await savedSavings(ctx.db, user!.id, stored),
        contribution: {
          amount: moneyFromE18(
            usdToE18(Number(stored.contribution_amount ?? 0)),
            0,
          ),
          cadence: cadenceOf(stored.contribution_cadence),
        },
      };
    }
  }

  return {
    inputs: {
      savedE18,
      targetE18: state.mandate.targetValue,
      monthlyE18,
      monthsRemaining: monthsUntil(state.mandate.targetDate, now),
    },
    goal,
    contributionUnknown: monthlyE18 === 0n,
  };
}

/** The goal, and whether it is going to happen. */
export async function getGoal(
  ctx: DomainContext,
  owner: Address,
  now = new Date(),
): Promise<GoalView> {
  const { inputs, goal, contributionUnknown } = await inputsFor(
    ctx,
    owner,
    now,
  );
  const projection = project(inputs);

  return {
    goal,
    saved: moneyFromE18(inputs.savedE18),
    health: projection.health,
    healthLabel: healthLabel(projection.health),
    summary: summaryFor(projection, inputs, contributionUnknown),
    projection,
    contributionUnknown,
  };
}

/**
 * The sentence under the number.
 *
 * It says what is true, then what would change it. No projected return appears, and where the
 * contribution is unknown it says so rather than quietly treating it as zero and reading as
 * "off track" for a person who is actually fine.
 */
function summaryFor(
  projection: Projection,
  inputs: ProjectionInputs,
  contributionUnknown: boolean,
): string {
  const months = inputs.monthsRemaining;
  const timeLeft =
    months <= 0
      ? "Your goal date has passed."
      : months === 1
        ? "You have about a month left."
        : months < 24
          ? `You have about ${months} months left.`
          : `You have about ${Math.round(months / 12)} years left.`;

  if (projection.health === "not_started") {
    return `You haven't added any money yet. ${timeLeft} Add some and this will start tracking.`;
  }

  if (contributionUnknown) {
    return projection.shortfallE18 === 0n
      ? `You've already reached your goal amount. ${timeLeft}`
      : `You're ${moneyInSentence(projection.shortfall)} away. ${timeLeft} Adding about ${moneyInSentence(projection.requiredMonthly)} a month would get you there — that figure assumes your money neither grows nor falls.`;
  }

  switch (projection.health) {
    case "on_track":
      return `You're on track. ${timeLeft} At what you're adding now, you'd reach your goal on time.`;
    case "needs_attention":
      return `You're close. ${timeLeft} About ${moneyInSentence(projection.extraMonthly)} more a month would put you back on track.`;
    case "off_track":
      return months <= 0
        ? `Your goal date has passed and you're ${moneyInSentence(projection.shortfall)} short. You can move the date or lower the target.`
        : `At what you're adding now, you'd finish about ${moneyInSentence(projection.shortfall)} short. Adding ${moneyInSentence(projection.extraMonthly)} more a month would close it.`;
    default:
      return timeLeft;
  }
}

// ------------------------------------------------------------------- scenarios

export type ScenarioSet = {
  source?: "live" | "manual";
  /** The questions, scaled to this person's own numbers. */
  available: Scenario[];
  /** The one that was asked, answered. Null when none was. */
  result: ScenarioResult | null;
  /** The assumption behind every figure, stated every time it is shown. */
  assumption: string;
};

const ASSUMPTION =
  "These figures assume your money neither grows nor falls. Modalis doesn't predict returns, so " +
  "the only number it will promise is the money you add yourself. If your plan grows, you'd " +
  "arrive sooner than this.";

/**
 * "What if?" — answered against the person's real goal.
 *
 * Reads only. Nothing here changes a plan; changing one needs their approval and their signature.
 */
export async function getScenarios(
  ctx: DomainContext,
  owner: Address,
  ask?: Scenario,
  now = new Date(),
  manualBaseAmount?: string,
): Promise<ScenarioSet> {
  let inputs: ProjectionInputs;
  if (manualBaseAmount !== undefined) {
    const { getPlan } = await import("./plans.ts");
    const { usdStringToE18 } = await import("./money.ts");
    const base = usdStringToE18(manualBaseAmount);
    if (base > 100_000_000n * E18)
      throw new DomainError(
        "bad_amount",
        "Choose an amount below $100 million.",
      );
    const plan = await getPlan(ctx, owner, undefined, now);
    inputs = {
      savedE18: base,
      targetE18: usdStringToE18(plan.goal.target.amount),
      monthlyE18: usdStringToE18(plan.goal.contribution.amount.amount),
      monthsRemaining: plan.goal.monthsRemaining,
    };
  } else {
    ({ inputs } = await inputsFor(ctx, owner, now));
  }
  return {
    available: defaultScenarios(inputs),
    result: ask ? runScenario(inputs, ask) : null,
    assumption:
      manualBaseAmount === undefined
        ? ASSUMPTION
        : "This calculation uses the starting amount you entered and your saved plan. It is not a live balance. It assumes no growth, fees or withdrawals beyond the change selected.",
    source: manualBaseAmount === undefined ? "live" : "manual",
  };
}

export { ASSUMPTION as projectionAssumption };
export type { Scenario, ScenarioResult, Projection, GoalHealth };
