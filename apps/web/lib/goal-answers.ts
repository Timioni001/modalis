"use client";

/**
 * The person's answers, held in the browser between /onboarding and /plan.
 *
 * sessionStorage rather than a server session: these answers are not financial state, they are a
 * form in progress, and keeping them client-side means nothing is persisted about a visitor who
 * never approves a plan. Once a plan is approved it lives on-chain, which is the only place that
 * matters — and /api/plan/approve is what saves the goal alongside it.
 */
import type { GoalAnswers } from "@modalis/domain";

const KEY = "modalis.goal.v2";

export function saveAnswers(answers: GoalAnswers): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // Private browsing or blocked storage: the flow still works, the person just cannot reload
    // the plan screen without answering again.
  }
}

export function loadAnswers(): GoalAnswers | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GoalAnswers) : null;
  } catch {
    return null;
  }
}

export function clearAnswers(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clean up */
  }
}

export const DEFAULT_ANSWERS: GoalAnswers = {
  goalKind: "house",
  targetAmount: 20_000,
  startingAmount: 10_000,
  contributionAmount: 200,
  contributionCadence: "monthly",
  monthsUntilNeeded: 60,
  ifItFellResponse: "do_nothing",
  comfortableLosingPercent: 15,
  moneyKeptAvailable: "some",
  incomeSteadiness: "stable",
};
