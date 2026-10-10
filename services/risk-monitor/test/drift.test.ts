/**
 * The demo market: small steps, pulled back toward the start, never further than the bound.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { driftStep } from "../src/scenario.ts";

const START = 50_000n * 10n ** 18n;

test("one step moves at most the step size", () => {
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const next = driftStep(START, START, { random: () => r });
    const moveBps = Number(((next - START) * 10_000n) / START);
    assert.ok(Math.abs(moveBps) <= 150, `moved ${moveBps} bps`);
  }
});

test("a long walk never leaves the band and does move", () => {
  let p = START;
  let seed = 42;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const seen = new Set<bigint>();
  for (let i = 0; i < 5_000; i++) {
    p = driftStep(p, START, { random });
    seen.add(p);
    assert.ok(p >= (START * 7_000n) / 10_000n && p <= (START * 13_000n) / 10_000n);
  }
  assert.ok(seen.size > 100, "prices actually change");
});

test("far from the start, the pull wins over the noise", () => {
  const high = (START * 12_500n) / 10_000n;
  // Even the most upward noise can't push it further up when the pull is at full strength.
  assert.ok(driftStep(high, START, { random: () => 0.6 }) < high);
});
