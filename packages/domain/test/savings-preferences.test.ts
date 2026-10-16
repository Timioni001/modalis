import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGoalAnswers } from "../src/goal-input.ts";
import {
  contributionCents,
  meetsMinimumContribution,
  normaliseSavingsPreferences,
  retrievalReminderAt,
  savingsPreferenceProblem,
} from "../src/savings-preferences.ts";
const ANSWERS = {
  goalKind: "house",
  targetAmount: 2000,
  startingAmount: 10,
  contributionAmount: 100,
  contributionCadence: "monthly",
  monthsUntilNeeded: 18,
  ifItFellResponse: "do_nothing",
  comfortableLosingPercent: 15,
  moneyKeptAvailable: "some",
  incomeSteadiness: "stable",
};

test("contribution minimums compare exact cents, including the boundary and large deposits", () => {
  assert.equal(contributionCents("0.10"), 10n);
  assert.equal(meetsMinimumContribution("10.09", "10.10"), false);
  assert.equal(meetsMinimumContribution("10.10", "10.10"), true);
  assert.equal(meetsMinimumContribution("1000000", "100000"), true);
  for (const value of ["-1", "1e2", "NaN", "0.001", "", "1,000", "0x10"])
    assert.equal(contributionCents(value), null);
});

test("savings preferences are optional, validated and stripped of client-supplied start dates", () => {
  const parsed = parseGoalAnswers({
    ...ANSWERS,
    savings: {
      minimumContribution: "000010.1",
      minimumRetrievalDays: 30,
      customDetails: "  Keep this for tuition.  ",
      startedAt: "2000-01-01T00:00:00Z",
    },
  });
  assert.deepEqual(parsed.savings, {
    minimumContribution: "10.10",
    minimumRetrievalDays: 30,
    customDetails: "Keep this for tuition.",
  });
  assert.equal(parseGoalAnswers(ANSWERS).savings, undefined);
  assert.throws(
    () =>
      parseGoalAnswers({
        ...ANSWERS,
        contributionAmount: 10,
        savings: { minimumContribution: "10.01", minimumRetrievalDays: 0 },
      }),
    /regular contribution/,
  );
  assert.equal(
    parseGoalAnswers({
      ...ANSWERS,
      contributionAmount: 0,
      savings: { minimumContribution: "10.01", minimumRetrievalDays: 0 },
    }).contributionAmount,
    0,
  );
});

test("malformed, fractional, nonfinite or excessive preferences are refused", () => {
  const valid = { minimumContribution: "0", minimumRetrievalDays: 0 };
  for (const input of [
    null,
    [],
    true,
    {},
    ...[
      { minimumContribution: 10 },
      { minimumContribution: "100000.01" },
      { minimumContribution: "-1" },
      { minimumContribution: "0.001" },
      { minimumRetrievalDays: 0.5 },
      { minimumRetrievalDays: -1 },
      { minimumRetrievalDays: 3651 },
      { minimumRetrievalDays: "30" },
      { minimumRetrievalDays: Infinity },
      { customDetails: "a".repeat(501) },
      { customDetails: {} },
    ].map((patch) => ({ ...valid, ...patch })),
  ]) {
    assert.ok(savingsPreferenceProblem(input));
    assert.throws(() => parseGoalAnswers({ ...ANSWERS, savings: input }));
  }
  assert.equal(
    savingsPreferenceProblem({
      minimumContribution: "100000.00",
      minimumRetrievalDays: 3650,
      customDetails: "a".repeat(500),
    }),
    null,
  );
  assert.deepEqual(normaliseSavingsPreferences(valid), {
    minimumContribution: "0.00",
    minimumRetrievalDays: 0,
  });
});

test("retrieval reminders use elapsed UTC days, never a browser timezone or an invented start", () => {
  const savings = { minimumContribution: "1.00", minimumRetrievalDays: 2 };
  assert.equal(retrievalReminderAt(savings), null);
  assert.equal(retrievalReminderAt({ ...savings, startedAt: "invalid" }), null);
  assert.equal(
    retrievalReminderAt({ ...savings, startedAt: "2028-02-28T23:45:00.000Z" }),
    "2028-03-01T23:45:00.000Z",
  );
  assert.equal(
    retrievalReminderAt({
      ...savings,
      minimumRetrievalDays: 0,
      startedAt: "2028-02-28T23:45:00.000Z",
    }),
    null,
  );
});
