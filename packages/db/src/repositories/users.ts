/**
 * Users and goals — the only rows a user writes directly.
 *
 * Wallet addresses are stored lowercase, which the schema enforces with a CHECK constraint and
 * which the RLS policies depend on: `current_wallet()` lowercases the JWT claim before comparing.
 * Normalising here keeps a checksummed address from silently failing to match.
 */
import type { ModalisClient } from "../client.ts";
import { tolerate } from "../errors.ts";
import type { GoalRow, GoalType, InterviewSessionRow, Json, UserRow } from "../types.generated.ts";

export const normaliseWallet = (address: string): string => address.toLowerCase();

export async function upsertUser(
  db: ModalisClient,
  input: { walletAddress: string; chainId: number; dynamicUserId?: string; email?: string },
): Promise<UserRow | null> {
  return tolerate("upsertUser", async () => {
    const { data, error } = await db
      .from("users")
      .upsert(
        {
          wallet_address: normaliseWallet(input.walletAddress),
          chain_id: input.chainId,
          ...(input.dynamicUserId ? { dynamic_user_id: input.dynamicUserId } : {}),
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
};

export async function createGoal(db: ModalisClient, input: GoalInput): Promise<GoalRow | null> {
  return tolerate("createGoal", async () => {
    const { data, error } = await db
      .from("goals")
      .insert({
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
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

/** The user's current goal, newest first. */
export async function latestGoal(db: ModalisClient, userId: string): Promise<GoalRow | null> {
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
): Promise<InterviewSessionRow | null> {
  return tolerate("latestInterview", async () => {
    const { data, error } = await db
      .from("interview_sessions")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  });
}
