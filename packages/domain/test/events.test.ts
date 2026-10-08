import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMAIN_EVENT_TYPES } from "@modalis/db";
import { notificationFor } from "../src/services/events.ts";

test("every event type has a decided outcome: a notification or deliberate silence", () => {
  for (const t of DOMAIN_EVENT_TYPES) {
    const n = notificationFor(t, {});
    if (n) {
      assert.ok(n.title.length > 0 && n.title.length <= 120, `${t} title`);
      assert.ok(n.body.length > 0 && n.body.length <= 600, `${t} body`);
    }
  }
});

test("a person is not notified of what they just did themselves", () => {
  for (const t of ["goal_created", "goal_updated", "goal_reprioritised", "plan_resumed"] as const) {
    assert.equal(notificationFor(t, {}), null, t);
  }
});

test("a refusal by the person's own rules is a safety notification, never a success", () => {
  const n = notificationFor("adjustment_blocked", { explanation: "Refused: over your 30% limit." })!;
  assert.equal(n.kind, "safety");
  assert.match(n.body, /30% limit/);
});

test("notification text comes from the event's own payload, not invented", () => {
  const n = notificationFor("money_added", { amount: "$500" })!;
  assert.equal(n.body, "$500 is in your plan.");
  const blank = notificationFor("money_added", {})!;
  assert.doesNotMatch(blank.body, /\$\d/, "no figure when the event carried none");
});
