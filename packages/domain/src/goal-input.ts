import { DomainError } from "./context.ts";
import type { GoalAnswers } from "./services/plans.ts";
import {
  normaliseSavingsPreferences,
  savingsPreferenceProblem,
  type SavingsPreferences,
} from "./savings-preferences.ts";

/** The form is untrusted on both drafting and saving. Reject malformed values before any I/O. */
export function parseGoalAnswers(input: unknown): GoalAnswers {
  const fail = (field: string): never => {
    throw new DomainError(
      "invalid_answers",
      `Check your answer for ${field}.`,
      400,
    );
  };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail("your goal");
  const data = input as Record<string, unknown>;
  function number(field: string, min: number, max: number): number {
    const value = data[field];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      !Number.isInteger(value)
    )
      return fail(field);
    return value;
  }
  function choice<T extends string>(field: string, options: readonly T[]): T {
    const value = data[field];
    if (typeof value !== "string" || !options.includes(value as T))
      return fail(field);
    return value as T;
  }
  const words = data.inTheirWords;
  if (words !== undefined && (typeof words !== "string" || words.length > 300))
    return fail("your description");
  if (data.savings !== undefined) {
    const problem = savingsPreferenceProblem(data.savings);
    if (problem) throw new DomainError("invalid_answers", problem, 400);
    const minimum = Number(
      (data.savings as SavingsPreferences).minimumContribution,
    );
    if (
      typeof data.contributionAmount === "number" &&
      data.contributionAmount > 0 &&
      data.contributionAmount < minimum
    )
      throw new DomainError(
        "invalid_answers",
        "Your regular contribution must meet your chosen minimum, or be zero if you do not plan regular contributions.",
        400,
      );
  }
  return {
    goalKind: choice("goalKind", [
      "house",
      "emergency_reserve",
      "education",
      "major_purchase",
      "long_term_wealth",
      "retirement",
      "travel",
      "custom",
    ]),
    targetAmount: number("targetAmount", 1, 5_000_000),
    startingAmount: number("startingAmount", 0, 5_000_000),
    contributionAmount: number("contributionAmount", 0, 100_000),
    contributionCadence: choice("contributionCadence", [
      "weekly",
      "monthly",
      "quarterly",
    ]),
    monthsUntilNeeded: number("monthsUntilNeeded", 1, 360),
    ifItFellResponse: choice("ifItFellResponse", [
      "sell_everything",
      "sell_some",
      "do_nothing",
      "invest_more",
    ]),
    comfortableLosingPercent: number("comfortableLosingPercent", 2, 40),
    moneyKeptAvailable: choice("moneyKeptAvailable", [
      "none",
      "some",
      "significant",
    ]),
    incomeSteadiness: choice("incomeSteadiness", [
      "unstable",
      "stable",
      "very_stable",
    ]),
    ...(data.savings !== undefined
      ? {
          savings: normaliseSavingsPreferences(
            data.savings as SavingsPreferences,
          ),
        }
      : {}),
    ...(typeof words === "string" && words.trim()
      ? { inTheirWords: words.trim() }
      : {}),
  };
}
