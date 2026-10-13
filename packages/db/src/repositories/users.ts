/**
 * Users and goals — the only rows a user writes directly.
 *
 * Wallet addresses are stored lowercase, which the schema enforces with a CHECK constraint and
 * which the RLS policies depend on: `current_wallet()` lowercases the JWT claim before comparing.
 * Normalising here keeps a checksummed address from silently failing to match.
 */
import type { ModalisClient } from "../client.ts";
import { tolerate } from "../errors.ts";
import type {
  GoalInsert,
  GoalRow,
  GoalType,
  InterviewSessionRow,
  Json,
  LiquidityNeed,
  UserRow,
} from "../types.generated.ts";

export const normaliseWallet = (address: string): string =>
  address.toLowerCase();

export async function upsertUser(
  db: ModalisClient,
  input: {
    walletAddress: string;
    chainId: number;
    dynamicUserId?: string;
    email?: string;
  },
): Promise<UserRow | null> {
  return tolerate("upsertUser", async () => {
    const { data, error } = await db
      .from("users")
      .upsert(
        {
          wallet_address: normaliseWallet(input.walletAddress),
          chain_id: input.chainId,
          ...(input.dynamicUserId
            ? { dynamic_user_id: input.dynamicUserId }
            : {}),
          ...(input.email ? { email: input.email } : {}),
        },
        { onConflict: "wallet_address" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export async function findUserByWallet(
  db: ModalisClient,
  walletAddress: string,
): Promise<UserRow | null> {
  return tolerate("findUserByWallet", async () => {
    const { data, error } = await db
      .from("users")
      .select()
      .eq("wallet_address", normaliseWallet(walletAddress))
      .maybeSingle();
    if (error) throw error;
    return data;
  });
}

export type GoalInput = {
  userId: string;
  type: GoalType;
  name: string;
  /** USD. Stored as numeric; supabase-js wants a string to avoid float drift. */
  targetValue: number;
  targetDate: string; // YYYY-MM-DD
  initialAmount: number;
  contributionAmount: number;
  contributionCadence: "weekly" | "monthly" | "quarterly";
  /** 1 is funded first. Omitted: after every existing goal. */
  priority?: number;
  liquidityNeed?: LiquidityNeed;
  savingsPreferences?: GoalRow["savings_preferences"];
};

export async function createGoal(
  db: ModalisClient,
  input: GoalInput,
): Promise<GoalRow | null> {
  // A new goal goes to the back of the queue unless a priority was given.
  const priority = input.priority ?? (await nextPriority(db, input.userId));
  return tolerate("createGoal", async () => {
    const row: GoalInsert = {
      user_id: input.userId,
      type: input.type,
      name: input.name,
      status: "active",
      // numeric columns go over the wire as strings so no float rounding is introduced.
      target_value: String(input.targetValue),
      target_date: input.targetDate,
      initial_amount: String(input.initialAmount),
      contribution_amount: String(input.contributionAmount),
      contribution_cadence: input.contributionCadence,
      priority,
      liquidity_need: input.liquidityNeed ?? "some",
      ...(input.savingsPreferences !== undefined
        ? { savings_preferences: input.savingsPreferences }
        : {}),
    };
    let result = await db.from("goals").insert(row).select().single();
    if (result.error && missingSavingsColumn(result.error)) {
      const { savings_preferences: unused, ...legacy } = row;
      result = await db.from("goals").insert(legacy).select().single();
    }
    if (result.error) throw result.error;
    return result.data;
  });
}

function missingSavingsColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    ["42703", "PGRST204"].includes(error.code ?? "") &&
    Boolean(error.message?.includes("savings_preferences"))
  );
}

/** The user's current goal, newest first. */
export async function latestGoal(
  db: ModalisClient,
  userId: string,
): Promise<GoalRow | null> {
  return tolerate("latestGoal", async () => {
    const { data, error } = await db
      .from("goals")
      .select()
      .eq("user_id", userId)
      .in("status", ["draft", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  });
}

export type InterviewInput = {
  userId: string;
  goalId?: string;
  answers: Json;
  parsedGoal?: Json;
  riskProfile?: Json;
  allocationPlan?: Json;
  model?: string;
};

/**
 * Stores the interview and what the intelligence layer derived from it. This is what lets a
 * returning user resume, and what makes a past mandate explainable after the fact.
 */
export async function saveInterview(
  db: ModalisClient,
  input: InterviewInput,
): Promise<InterviewSessionRow | null> {
  return tolerate("saveInterview", async () => {
    const { data, error } = await db
      .from("interview_sessions")
      .insert({
        user_id: input.userId,
        goal_id: input.goalId ?? null,
        answers: input.answers,
        parsed_goal: input.parsedGoal ?? null,
        risk_profile: input.riskProfile ?? null,
        allocation_plan: input.allocationPlan ?? null,
        model: input.model ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export async function latestInterview(
  db: ModalisClient,
  userId: string,
  goalId?: string,
): Promise<InterviewSessionRow | null> {
  return tolerate("latestInterview", async () => {
    let query = db.from("interview_sessions").select().eq("user_id", userId);
    if (goalId) query = query.eq("goal_id", goalId);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  });
}

// ------------------------------------------------------------------ several goals (0002)
//
// Every query below filters on user_id explicitly. The server talks to the database with the
// service role, which bypasses RLS — so the filter here IS the ownership check, not a
// redundancy. A goal id alone never selects a row.

async function nextPriority(
  db: ModalisClient,
  userId: string,
): Promise<number> {
  const { data } = await db
    .from("goals")
    .select("priority")
    .eq("user_id", userId)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.priority ?? 0) + 1;
}

/** The person's live goals, in the order they are funded. */
export async function listGoals(
  db: ModalisClient,
  userId: string,
): Promise<GoalRow[]> {
  const rows = await tolerate("listGoals", async () => {
    const { data, error } = await db
      .from("goals")
      .select()
      .eq("user_id", userId)
      .in("status", ["draft", "active"])
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });
  return rows ?? [];
}

export type GoalPatch = Partial<{
  type: GoalType;
  initialAmount: number;
  name: string;
  targetValue: number;
  targetDate: string;
  contributionAmount: number;
  contributionCadence: "weekly" | "monthly" | "quarterly";
  liquidityNeed: LiquidityNeed;
  savingsPreferences: GoalRow["savings_preferences"];
  status: "active" | "achieved" | "archived";
}>;

export async function updateGoal(
  db: ModalisClient,
  userId: string,
  goalId: string,
  patch: GoalPatch,
): Promise<GoalRow | null> {
  return tolerate("updateGoal", async () => {
    const row: Partial<GoalInsert> = {};
    if (patch.type !== undefined) row.type = patch.type;
    if (patch.initialAmount !== undefined)
      row.initial_amount = String(patch.initialAmount);
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.targetValue !== undefined)
      row.target_value = String(patch.targetValue);
    if (patch.targetDate !== undefined) row.target_date = patch.targetDate;
    if (patch.contributionAmount !== undefined)
      row.contribution_amount = String(patch.contributionAmount);
    if (patch.contributionCadence !== undefined)
      row.contribution_cadence = patch.contributionCadence;
    if (patch.liquidityNeed !== undefined)
      row.liquidity_need = patch.liquidityNeed;
    if (patch.savingsPreferences !== undefined)
      row.savings_preferences = patch.savingsPreferences;
    if (patch.status !== undefined) row.status = patch.status;
    let result = await db
      .from("goals")
      .update(row)
      .eq("id", goalId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (result.error && missingSavingsColumn(result.error)) {
      const { savings_preferences: unused, ...legacy } = row;
      // An edit containing only savings still verifies ownership and updates the row timestamp.
      result = await db
        .from("goals")
        .update({ ...legacy, updated_at: new Date().toISOString() })
        .eq("id", goalId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
    }
    if (result.error) throw result.error;
    return result.data;
  });
}

/**
 * Sets priorities from an ordered list of goal ids: the first is funded first. Ids that do not
 * belong to this person are ignored rather than trusted.
 */
export async function reprioritiseGoals(
  db: ModalisClient,
  userId: string,
  orderedIds: string[],
): Promise<boolean> {
  const done = await tolerate("reprioritiseGoals", async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await db
        .from("goals")
        .update({ priority: i + 1 })
        .eq("id", orderedIds[i])
        .eq("user_id", userId);
      if (error) throw error;
    }
    return true;
  });
  return done ?? false;
}
