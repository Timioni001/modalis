"use client";

/**
 * Interview answers held in the browser between /onboarding and /mandate.
 *
 * sessionStorage rather than a server session: these answers are not financial state, they are a
 * form in progress, and keeping them client-side means nothing is persisted about a visitor who
 * never approves a mandate. Once a mandate is approved it lives on-chain, which is the only
 * place that matters.
 */
import type { InterviewAnswers } from "@modalis/ai";

const KEY = "modalis.interview.v1";

export function saveAnswers(answers: InterviewAnswers): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // Private browsing or blocked storage: the flow still works, the user just cannot refresh
    // /mandate without redoing the interview.
  }
}

export function loadAnswers(): InterviewAnswers | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as InterviewAnswers) : null;
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

export const DEFAULT_ANSWERS: InterviewAnswers = {
  goalType: "house",
  targetValue: 20_000,
  initialAmount: 10_000,
  contributionAmount: 200,
  contributionCadence: "monthly",
  horizonMonths: 60,
  drawdownResponse: "do_nothing",
  maxTolerableDrawdownPct: 15,
  liquidityNeed: "some",
  incomeStability: "stable",
};
