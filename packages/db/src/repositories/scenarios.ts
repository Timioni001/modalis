/** Scenario history. The chain remains the source of truth; these rows preserve what a person
 * explored and which future they selected so the choice can be explained later. */
import type { ModalisClient } from "../client.ts";
import { tolerate } from "../errors.ts";
import type { Json, ScenarioInsert, ScenarioRow } from "../types.generated.ts";

export type ScenarioInput = {
  userId: string;
  goalId?: string | null;
  prompt: string;
  inputs: Json;
  result?: Json | null;
};

export async function createScenario(db: ModalisClient, input: ScenarioInput): Promise<ScenarioRow | null> {
  return tolerate("createScenario", async () => {
    const row: ScenarioInsert = {
      user_id: input.userId,
      goal_id: input.goalId ?? null,
      prompt: input.prompt.slice(0, 500),
      inputs: input.inputs,
      result: input.result ?? null,
    };
    const { data, error } = await db.from("scenarios").insert(row).select().single();
    if (error) throw error;
    return data;
  });
}

/** Only the owner can update a scenario. The service client still receives both predicates. */
export async function updateScenarioResult(
  db: ModalisClient,
  userId: string,
  scenarioId: string,
  result: Json,
): Promise<ScenarioRow | null> {
  return tolerate("updateScenarioResult", async () => {
    const { data, error } = await db
      .from("scenarios")
      .update({ result })
      .eq("id", scenarioId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  });
}

export async function listScenarios(
  db: ModalisClient,
  userId: string,
  goalId?: string | null,
  limit = 20,
): Promise<ScenarioRow[]> {
  const rows = await tolerate("listScenarios", async () => {
    let query = db
      .from("scenarios")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (goalId) query = query.eq("goal_id", goalId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  });
  return rows ?? [];
}
