import { latestInterview, type GoalRow, type ModalisClient } from "@modalis/db";
import {
  savingsPreferenceProblem,
  normaliseSavingsPreferences,
  type SavingsSchedule,
  type SavingsPreferences,
} from "../savings-preferences.ts";

/** Existing interview JSON is a compatible store when migration 0004 is not installed yet. */
export async function savedSavings(
  db: ModalisClient,
  userId: string,
  goal: GoalRow,
): Promise<SavingsSchedule | undefined> {
  const interview = await latestInterview(db, userId, goal.id);
  const answers = interview?.answers;
  const saved =
    answers && typeof answers === "object" && !Array.isArray(answers)
      ? answers.savings
      : undefined;
  for (const input of [saved, goal.savings_preferences]) {
    if (savingsPreferenceProblem(input)) continue;
    const data = input as unknown as SavingsSchedule;
    const startedAt =
      typeof data.startedAt === "string" &&
      Number.isFinite(Date.parse(data.startedAt))
        ? data.startedAt
        : undefined;
    return {
      ...normaliseSavingsPreferences(data as SavingsPreferences),
      ...(startedAt ? { startedAt } : {}),
    };
  }
  return undefined;
}
