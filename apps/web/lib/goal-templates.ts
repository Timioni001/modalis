/**
 * Common goals with sensible starting answers. A template only pre-fills the questions; the
 * person still sees and can change every one before a plan is drafted.
 */
import type { GoalAnswers } from "@modalis/domain";

export type GoalTemplate = {
  id: string;
  label: string;
  hint: string;
  words: string;
  answers: Partial<GoalAnswers>;
};

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: "emergency",
    label: "Emergency fund",
    hint: "$3,000 in a year, kept easy to reach",
    words: "An emergency fund I can reach quickly",
    answers: {
      goalKind: "emergency_reserve",
      targetAmount: 3_000,
      startingAmount: 500,
      contributionAmount: 50,
      contributionCadence: "weekly",
      monthsUntilNeeded: 12,
      ifItFellResponse: "sell_some",
      comfortableLosingPercent: 5,
      moneyKeptAvailable: "significant",
    },
  },
  {
    id: "rent",
    label: "Rent deposit",
    hint: "$2,500 in 6 months",
    words: "A deposit and first month's rent for a new place",
    answers: {
      goalKind: "major_purchase",
      targetAmount: 2_500,
      startingAmount: 500,
      contributionAmount: 300,
      contributionCadence: "monthly",
      monthsUntilNeeded: 6,
      ifItFellResponse: "sell_some",
      comfortableLosingPercent: 5,
      moneyKeptAvailable: "significant",
    },
  },
  {
    id: "school",
    label: "School fees",
    hint: "$6,000 in 12 months",
    words: "School fees due next year",
    answers: {
      goalKind: "education",
      targetAmount: 6_000,
      startingAmount: 1_000,
      contributionAmount: 400,
      contributionCadence: "monthly",
      monthsUntilNeeded: 12,
      ifItFellResponse: "do_nothing",
      comfortableLosingPercent: 8,
      moneyKeptAvailable: "some",
    },
  },
  {
    id: "wedding",
    label: "Wedding",
    hint: "$15,000 in 18 months",
    words: "Our wedding in about a year and a half",
    answers: {
      goalKind: "major_purchase",
      targetAmount: 15_000,
      startingAmount: 3_000,
      contributionAmount: 650,
      contributionCadence: "monthly",
      monthsUntilNeeded: 18,
      ifItFellResponse: "do_nothing",
      comfortableLosingPercent: 10,
      moneyKeptAvailable: "some",
    },
  },
  {
    id: "home",
    label: "Home deposit",
    hint: "$25,000 in 5 years",
    words: "A deposit on a home in about five years",
    answers: {
      goalKind: "house",
      targetAmount: 25_000,
      startingAmount: 5_000,
      contributionAmount: 300,
      contributionCadence: "monthly",
      monthsUntilNeeded: 60,
      ifItFellResponse: "do_nothing",
      comfortableLosingPercent: 15,
      moneyKeptAvailable: "some",
    },
  },
];
