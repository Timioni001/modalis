import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGoalAnswers } from "../src/goal-input.ts";
const valid = { goalKind: "house", targetAmount: 2000, startingAmount: 10, contributionAmount: 100,
  contributionCadence: "weekly", monthsUntilNeeded: 18, ifItFellResponse: "do_nothing",
  comfortableLosingPercent: 15, moneyKeptAvailable: "some", incomeSteadiness: "stable" };
test("validated goal input preserves contribution amount and original cadence", () => {
  assert.deepEqual(parseGoalAnswers(valid), valid);
});
test("goal inputs reject unknown enums, nonfinite values, negative money and oversized descriptions", () => {
  for (const patch of [{ goalKind: "unsafe" }, { contributionCadence: "daily" }, { targetAmount: Infinity },
    { startingAmount: -1 }, { monthsUntilNeeded: 361 }, { contributionAmount: "100" },
    { comfortableLosingPercent: 100 }, { inTheirWords: "a".repeat(301) }]) {
    assert.throws(() => parseGoalAnswers({ ...valid, ...patch }), /Check your answer/);
  }
  for (const input of [null, [], true]) assert.throws(() => parseGoalAnswers(input));
});
