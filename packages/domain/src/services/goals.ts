/**
 * Goals, plural (§5, §6).
 *
 * The total comes from the chain and nowhere else; the goals, their order and what the person
 * adds for each come from the database. `allocateAcrossGoals` divides one by the other.
 *
 * The goal the plan was built for keeps the chain's target, because that is the one the contract
 * enforces. Other goals are the person's own bookkeeping over the same money.
 *
 * Writes need a database (goals beyond the plan's own cannot live on-chain) and are always scoped
 * to the authenticated owner: a goal id that belongs to someone else matches nothing.
 */
import { readPortfolio } from "@modalis/chain";
import { getAddress, type Address } from "viem";
import {
  activeMandate,
  createGoal,
  findUserByWallet,
  listGoals,
  reprioritiseGoals,
  updateGoal,
  upsertUser,
  type GoalType,
  type LiquidityNeed,
} from "@modalis/db";
import { DomainError, type DomainContext } from "../context.ts";
import {
  allocateAcrossGoals,
  assignContribution,
  goalCards,
  type GoalBook,
  type GoalCard,
  type GoalSpec,
} from "../goals.ts";
import { moneyFromE18, moneyInSentence, type Money } from "../models.ts";
import { specFromRow } from "./goal.ts";
import { emit } from "./events.ts";
import { getPlan } from "./plans.ts";

export type GoalDefinition = {
  id: string;
  name: string;
  priority: number;
  target: Money;
  targetDate: string;
  monthly: Money;
};

export type GoalsView = {
  goals: GoalCard[];
  total: Money | null;
  /** Money beyond every goal's target. */
  surplus: Money | null;
  definitions?: GoalDefinition[];
  valuationAvailable?: boolean;
  /** The goal the approved plan was built for. Its target is the one the contract enforces. */
  planGoalId: string | null;
  /** False when there is no database: only the plan's own goal can be shown. */
  canManage: boolean;
};

const PLAN_GOAL_ID = "plan";

/**
 * The goal book for one person. Exported for the overview's single-goal view, which needs the
 * plan goal's share once there is more than one goal.
 */
export async function goalBookFor(
  ctx: DomainContext,
  owner: Address,
  now = new Date(),
): Promise<{ book: GoalBook; planGoalId: string | null; canManage: boolean }> {
  const who = getAddress(owner);
  const state = await readPortfolio(ctx.client, ctx.deployment, who);
  if (!state.hasMandate) {
    throw new DomainError(
      "no_plan",
      "You don't have a plan yet. Build one first, then add more goals.",
      404,
    );
  }

  const chainTarget = state.mandate.targetValue;
  const chainDate = new Date(state.mandate.targetDate * 1000)
    .toISOString()
    .slice(0, 10);

  let specs: GoalSpec[] = [];
  let planGoalId: string | null = null;

  if (ctx.db) {
    const user = await findUserByWallet(ctx.db, who);
    if (user) {
      const [rows, mandate] = await Promise.all([
        listGoals(ctx.db, user.id),
        activeMandate(ctx.db, user.id),
      ]);
      specs = rows.map(specFromRow);
      planGoalId = mandate?.goal_id ?? null;
    }
  }

  if (specs.length === 0) {
    // No stored goals: the plan's own goal, from the chain alone.
    specs = [
      {
        id: PLAN_GOAL_ID,
        name: "Your goal",
        kind: "custom",
        priority: 1,
        targetE18: chainTarget,
        targetDate: chainDate,
        monthlyE18: 0n,
        liquidityNeed: "some",
        createdAt: new Date(0).toISOString(),
      },
    ];
    planGoalId = PLAN_GOAL_ID;
  } else if (planGoalId) {
    // The enforceable target and date are the chain's, whatever the stored row says.
    specs = specs.map((s) =>
      s.id === planGoalId
        ? { ...s, targetE18: chainTarget, targetDate: chainDate }
        : s,
    );
  }

  return {
    book: allocateAcrossGoals(state.totalValueE18, specs, now),
    planGoalId,
    canManage: Boolean(ctx.db),
  };
}

export async function getGoals(
  ctx: DomainContext,
  owner: Address,
  now = new Date(),
): Promise<GoalsView> {
  // Goal metadata has no dependence on prices. A failed valuation is not a missing goal.
  let result: Awaited<ReturnType<typeof goalBookFor>>;
  try {
    result = await goalBookFor(ctx, owner, now);
  } catch (error) {
    if (error instanceof DomainError && error.code === "no_plan") throw error;
    const plan = await getPlan(ctx, owner, undefined, now);
    const user = ctx.db
      ? await findUserByWallet(ctx.db, getAddress(owner))
      : null;
    const rows = ctx.db && user ? await listGoals(ctx.db, user.id) : [];
    const definitions: GoalDefinition[] = rows.map((row) => {
      const spec = specFromRow(row);
      return {
        id: row.id,
        name: row.name,
        priority: row.priority,
        target:
          row.id === plan.goal.id
            ? plan.goal.target
            : moneyFromE18(spec.targetE18),
        targetDate:
          row.id === plan.goal.id ? plan.goal.targetDate : row.target_date,
        monthly: moneyFromE18(spec.monthlyE18),
      };
    });
    if (definitions.length === 0)
      definitions.push({
        id: plan.goal.id ?? PLAN_GOAL_ID,
        name: plan.goal.name,
        priority: 1,
        target: plan.goal.target,
        targetDate: plan.goal.targetDate,
        monthly: plan.goal.contribution.amount,
      });
    return {
      goals: [],
      definitions,
      total: null,
      surplus: null,
      planGoalId: plan.goal.id,
      canManage: Boolean(ctx.db),
      valuationAvailable: false,
    };
  }
  const { book, planGoalId, canManage } = result;
  return {
    goals: goalCards(book),
    total: moneyFromE18(book.totalE18),
    surplus: moneyFromE18(book.surplusE18),
    planGoalId,
    canManage,
    valuationAvailable: true,
  };
}

/** "Where would $X go?" under the waterfall. */
export async function previewContribution(
  ctx: DomainContext,
  owner: Address,
  amountE18: bigint,
): Promise<
  { goalId: string | null; name: string; amount: Money; sentence: string }[]
> {
  const { book } = await goalBookFor(ctx, owner);
  return assignContribution(book, amountE18).map((d) => ({
    goalId: d.goalId,
    name: d.name,
    amount: moneyFromE18(d.amountE18),
    sentence: d.goalId
      ? `${moneyInSentence(moneyFromE18(d.amountE18))} toward ${d.name.toLowerCase()}`
      : `${moneyInSentence(moneyFromE18(d.amountE18))} beyond every goal`,
  }));
}

export type NewGoal = {
  kind: GoalType;
  name: string;
  targetValue: number;
  targetDate: string;
  contributionAmount: number;
  contributionCadence: "weekly" | "monthly" | "quarterly";
  liquidityNeed: LiquidityNeed;
};

async function requireUser(ctx: DomainContext, owner: Address) {
  if (!ctx.db) {
    throw new DomainError(
      "no_database",
      "Extra goals need saved data, which isn't set up on this deployment.",
      503,
    );
  }
  const user = await upsertUser(ctx.db, {
    walletAddress: getAddress(owner),
    chainId: ctx.deployment.chainId,
  });
  if (!user)
    throw new DomainError(
      "save_failed",
      "We couldn't save that right now. Try again shortly.",
      503,
    );
  return { db: ctx.db, user };
}

function checkGoal(g: Partial<NewGoal>, now: Date) {
  if (g.targetDate !== undefined) {
    const t = new Date(`${g.targetDate}T00:00:00Z`).getTime();
    if (Number.isNaN(t))
      throw new DomainError("bad_date", "Choose a date for this goal.");
    if (t <= now.getTime())
      throw new DomainError("bad_date", "The date has to be in the future.");
    if (t > now.getTime() + 60 * 365.25 * 24 * 3600 * 1000)
      throw new DomainError(
        "bad_date",
        "Choose a date within the next 60 years.",
      );
  }
}

export async function addGoal(
  ctx: DomainContext,
  owner: Address,
  input: NewGoal,
  now = new Date(),
): Promise<GoalsView> {
  checkGoal(input, now);
  const { db, user } = await requireUser(ctx, owner);
  const existing = await listGoals(db, user.id);
  if (existing.length >= 12)
    throw new DomainError(
      "too_many_goals",
      "You can have up to 12 goals at once.",
    );

  const row = await createGoal(db, {
    userId: user.id,
    type: input.kind,
    name: input.name,
    targetValue: input.targetValue,
    targetDate: input.targetDate,
    initialAmount: 0,
    contributionAmount: input.contributionAmount,
    contributionCadence: input.contributionCadence,
    liquidityNeed: input.liquidityNeed,
  });
  if (!row)
    throw new DomainError(
      "save_failed",
      "We couldn't save that goal. Try again shortly.",
      503,
    );
  await emit(db, {
    userId: user.id,
    type: "goal_created",
    goalId: row.id,
    payload: { name: row.name },
  });
  return getGoals(ctx, owner, now);
}

export async function editGoal(
  ctx: DomainContext,
  owner: Address,
  goalId: string,
  patch: Partial<Omit<NewGoal, "kind">> & { status?: "achieved" | "archived" },
  now = new Date(),
): Promise<GoalsView> {
  checkGoal(patch, now);
  const { db, user } = await requireUser(ctx, owner);
  const mandate = await activeMandate(db, user.id);
  if (
    mandate?.goal_id === goalId &&
    (patch.targetValue !== undefined ||
      patch.targetDate !== undefined ||
      patch.status !== undefined)
  ) {
    // The plan's goal is enforced on-chain. Changing its target or ending it is a plan change,
    // signed by the person — not a database edit that would make the screen disagree with the contract.
    throw new DomainError(
      "plan_goal_locked",
      "This goal's target and date are part of your approved plan. Change your plan to change them.",
      409,
    );
  }
  const row = await updateGoal(db, user.id, goalId, patch);
  if (!row)
    throw new DomainError("not_found", "We couldn't find that goal.", 404);
  await emit(db, {
    userId: user.id,
    type: "goal_updated",
    goalId,
    payload: { name: row.name },
  });
  return getGoals(ctx, owner, now);
}

export async function reorderGoals(
  ctx: DomainContext,
  owner: Address,
  orderedIds: string[],
  now = new Date(),
): Promise<GoalsView> {
  const { db, user } = await requireUser(ctx, owner);
  const mine = new Set((await listGoals(db, user.id)).map((g) => g.id));
  // Every id must be one of theirs, and every one of theirs must be in the list: a partial or
  // foreign list would leave two goals sharing a rank.
  if (
    orderedIds.length !== mine.size ||
    orderedIds.some((id) => !mine.has(id)) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    throw new DomainError(
      "bad_order",
      "That order doesn't match your goals. Refresh and try again.",
    );
  }
  const ok = await reprioritiseGoals(db, user.id, orderedIds);
  if (!ok)
    throw new DomainError(
      "save_failed",
      "We couldn't save that order. Try again shortly.",
      503,
    );
  await emit(db, {
    userId: user.id,
    type: "goal_reprioritised",
    payload: { order: orderedIds },
  });
  return getGoals(ctx, owner, now);
}
