import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AUTOMATION,
  effectiveAutomation,
  mayExecuteOnRequest,
  mayRunWithoutAsking,
  requestAutomation,
} from "../src/automation.ts";

const T0 = new Date("2026-01-01T12:00:00Z");
const later = (h: number) => new Date(T0.getTime() + h * 3600_000);

const go = {
  now: T0, allowedByRules: true, planPaused: false, permissionGranted: true, operatorEnabled: true,
};

test("raising authority waits: switching on and acting in the same minute is impossible", () => {
  const s = requestAutomation(DEFAULT_AUTOMATION, "automated", T0);
  assert.equal(s.level, "assisted");
  assert.equal(s.requestedLevel, "automated");
  assert.equal(mayRunWithoutAsking({ ...go, automation: s, now: later(0.01) }).run, false);
});

test("after the wait, the raise is in force", () => {
  const s = requestAutomation(DEFAULT_AUTOMATION, "automated", T0);
  assert.equal(effectiveAutomation(s, later(24)).level, "automated");
  assert.equal(mayRunWithoutAsking({ ...go, automation: s, now: later(24) }).run, true);
});

test("lowering is immediate and cancels a raise that was waiting", () => {
  const pending = requestAutomation(DEFAULT_AUTOMATION, "automated", T0);
  const lowered = requestAutomation(pending, "guided", later(1));
  assert.deepEqual(lowered, { level: "guided", requestedLevel: null, effectiveAt: null });
  assert.equal(effectiveAutomation(lowered, later(48)).level, "guided", "the cancelled raise never lands");
});

test("asking again for the same raise does not restart the clock", () => {
  const a = requestAutomation(DEFAULT_AUTOMATION, "automated", T0);
  const b = requestAutomation(a, "automated", later(5));
  assert.equal(b.effectiveAt, a.effectiveAt);
});

test("automation never overrides the rules, a pause, or the on-chain permission", () => {
  const on = effectiveAutomation(requestAutomation(DEFAULT_AUTOMATION, "automated", T0), later(25));
  const at = later(25);
  assert.equal(mayRunWithoutAsking({ ...go, now: at, automation: on, allowedByRules: false }).run, false);
  assert.equal(mayRunWithoutAsking({ ...go, now: at, automation: on, planPaused: true }).run, false);
  assert.equal(mayRunWithoutAsking({ ...go, now: at, automation: on, permissionGranted: false }).run, false);
  assert.equal(mayRunWithoutAsking({ ...go, now: at, automation: on, operatorEnabled: false }).run, false);
});

test("guided means suggestions only, even when asked", () => {
  assert.equal(mayExecuteOnRequest({ level: "guided", requestedLevel: null, effectiveAt: null }, T0), false);
  assert.equal(mayExecuteOnRequest(DEFAULT_AUTOMATION, T0), true);
});
