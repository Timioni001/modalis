import { test } from "node:test";
import assert from "node:assert/strict";
import { affordability, inflatedTarget } from "../lib/afford.ts";

const goals = [
  { id: "a", name: "Emergency fund", saved: 3000, monthly: 200 },
  { id: "b", name: "House", saved: 1000, monthly: 250 },
];

test("a purchase comes out of the last-funded goal first", () => {
  const r = affordability(goals, 600);
  assert.deepEqual(r.hits, [{ id: "b", name: "House", takes: 600, delayMonths: 3 }]);
  assert.equal(r.uncovered, 0);
});

test("a larger purchase reaches the first goal too", () => {
  const r = affordability(goals, 1500);
  assert.deepEqual(
    r.hits.map((h) => [h.id, h.takes, h.delayMonths]),
    [
      ["b", 1000, 4],
      ["a", 500, 3],
    ],
  );
});

test("more than everything saved leaves an uncovered amount", () => {
  assert.equal(affordability(goals, 5000).uncovered, 1000);
});

test("no monthly amount means no delay estimate", () => {
  const r = affordability([{ id: "x", name: "X", saved: 100, monthly: 0 }], 50);
  assert.equal(r.hits[0].delayMonths, null);
});

test("inflation grows the target over the years", () => {
  assert.equal(Math.round(inflatedTarget(10_000, 24, 0.03)), 10_609);
  assert.equal(inflatedTarget(10_000, 0, 0.03), 10_000);
});
