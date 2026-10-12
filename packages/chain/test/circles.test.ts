import { test } from "node:test";
import assert from "node:assert/strict";
import { isOverdue, potOf, recipientOf, type Circle } from "../src/circles.ts";

const circle = (over: Partial<Circle> = {}): Circle => ({
  id: 0n,
  name: "Family ajo",
  token: "0x0000000000000000000000000000000000000001",
  contribution: 100n,
  roundSeconds: 604800,
  roundDeadline: 1_000,
  round: 1,
  paidCount: 0,
  status: "active",
  creator: "0x00000000000000000000000000000000000000a1",
  members: [
    "0x00000000000000000000000000000000000000a1",
    "0x00000000000000000000000000000000000000b2",
    "0x00000000000000000000000000000000000000c3",
  ],
  paidThisRound: [false, false, false],
  ...over,
});

test("the pot is one share from every member", () => {
  assert.equal(potOf(circle()), 300n);
});

test("the recipient follows the member order", () => {
  assert.equal(recipientOf(circle({ round: 0 })), circle().members[0]);
  assert.equal(recipientOf(circle({ round: 2 })), circle().members[2]);
});

test("only an active circle past its deadline is overdue", () => {
  assert.equal(isOverdue(circle(), 999), false);
  assert.equal(isOverdue(circle(), 1_001), true);
  assert.equal(isOverdue(circle({ status: "completed" }), 1_001), false);
});
