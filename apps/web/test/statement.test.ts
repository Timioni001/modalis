import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActivityItem } from "@modalis/domain";
import { activityCsv, weekSummary } from "../lib/statement.ts";

const now = new Date("2026-10-10T12:00:00Z");
const item = (over: Partial<ActivityItem>): ActivityItem => ({
  id: Math.random().toString(),
  kind: "money_added",
  title: "Money added",
  detail: "",
  at: "2026-10-09T12:00:00Z",
  ...over,
});

test("the CSV has a header and escapes commas and quotes", () => {
  const csv = activityCsv([
    item({ amount: { amount: "200", currency: "USD" }, detail: 'Split "evenly", as planned', receipt: { reference: "0xabc", confirmed: true } }),
  ]);
  const [head, row] = csv.trim().split("\n");
  assert.equal(head, "Date,What happened,Amount (USD),Detail,Receipt,Explorer link");
  assert.equal(row, '2026-10-09T12:00:00Z,Money added,200,"Split ""evenly"", as planned",0xabc,');
});

test("the week summary counts only the last seven days", () => {
  const s = weekSummary(
    [
      item({ amount: { amount: "200", currency: "USD" } }),
      item({ amount: { amount: "999", currency: "USD" }, at: "2026-09-01T00:00:00Z" }),
      item({ kind: "adjustment_made", title: "Adjusted" }),
      item({ kind: "adjustment_blocked", title: "Blocked" }),
    ],
    now,
  );
  assert.equal(s.added, 200);
  assert.equal(s.adjustments, 1);
  assert.equal(
    s.sentence,
    "In the last 7 days you added $200, Modalis made 1 adjustment within your limits. Your limits stopped 1 trade that would have broken them.",
  );
});

test("a quiet week says so", () => {
  assert.equal(weekSummary([], now).sentence, "Nothing moved in the last 7 days. Nothing needed your attention.");
});
