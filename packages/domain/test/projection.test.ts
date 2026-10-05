/**
 * The projection engine.
 *
 * The property that matters most is what is ABSENT: there is no interest rate anywhere in this
 * engine, and these tests pin that down. A product that quietly compounds 7% a year turns a guess
 * into a promise, and the person only finds out it was a guess at the end.
 *
 * So every figure assumes zero growth, which means every figure is something the person controls.
 * If their money grows, they arrive early — the only direction a surprise should go in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyScenario,
  defaultScenarios,
  healthLabel,
  project,
  runScenario,
  type ProjectionInputs,
  type Scenario,
} from "../src/projection.ts";

const E18 = 10n ** 18n;
const usd = (n: number) => BigInt(Math.round(n * 100)) * 10n ** 16n;

/** $10,000 saved, $20,000 goal, $200 a month, 5 years. Exactly on track. */
const onTrack: ProjectionInputs = {
  savedE18: usd(10_000),
  targetE18: usd(20_000),
  monthlyE18: usd(200),
  monthsRemaining: 50,
};

test("a projection adds only the money the person adds, never a return", () => {
  const p = project(onTrack);
  // $10,000 + (50 x $200) = $20,000. Not a cent more: no growth is assumed anywhere.
  assert.equal(p.projectedE18, usd(20_000));
  assert.equal(p.shortfallE18, 0n);
  assert.equal(p.health, "on_track");
});

test("the engine contains no rate of return at all", () => {
  // Doubling the time with no contribution must not grow the balance by a single cent. If a rate
  // ever creeps in, this is the test that catches it.
  const idle: ProjectionInputs = {
    savedE18: usd(10_000),
    targetE18: usd(20_000),
    monthlyE18: 0n,
    monthsRemaining: 600,
  };
  assert.equal(project(idle).projectedE18, usd(10_000));
  assert.equal(project({ ...idle, monthsRemaining: 1 }).projectedE18, usd(10_000));
});

test("a shortfall is reported with what it would take to close it", () => {
  const short = { ...onTrack, monthlyE18: usd(100) };
  const p = project(short);

  assert.equal(p.projectedE18, usd(15_000));
  assert.equal(p.shortfallE18, usd(5_000));
  // $10,000 still needed over 50 months is $200 a month, which is $100 more than they add.
  assert.equal(p.requiredMonthly.amount, "200.00");
  assert.equal(p.extraMonthly.amount, "100.00");
  assert.equal(p.health, "off_track");
});

test("a small gap needs attention; a large one is off track", () => {
  // Within 10% of the required contribution: close enough to nudge, not to alarm.
  const nearly = project({ ...onTrack, monthlyE18: usd(190) });
  assert.equal(nearly.health, "needs_attention");

  const far = project({ ...onTrack, monthlyE18: usd(120) });
  assert.equal(far.health, "off_track");
});

test("someone who has added nothing has not started, rather than being off track", () => {
  const fresh = project({ ...onTrack, savedE18: 0n, monthlyE18: 0n });
  assert.equal(fresh.health, "not_started");
  assert.equal(healthLabel(fresh.health), "Not started");
});

test("already reaching the target reads as on track whatever the contribution", () => {
  const done = project({ ...onTrack, savedE18: usd(25_000), monthlyE18: 0n });
  assert.equal(done.health, "on_track");
  assert.equal(done.shortfallE18, 0n);
  assert.equal(done.monthsToReach, 0);
  assert.equal(done.percentComplete, 100, "capped: '125% complete' helps nobody");
});

test("a passed date with money still owed is off track, however small the gap", () => {
  const late = project({ ...onTrack, monthsRemaining: 0, savedE18: usd(19_900) });
  assert.equal(late.health, "off_track");
});

test("with no contribution there is no honest arrival date, so none is invented", () => {
  const stalled = project({ ...onTrack, monthlyE18: 0n });
  assert.equal(stalled.monthsToReach, null, "null, not Infinity and not a guess");
  assert.equal(stalled.shortfallE18, usd(10_000));
});

test("the required contribution rounds up, because arriving late is the failure", () => {
  // $10,000 over 3 months is $3,333.33…; rounding down would leave them a cent short.
  const p = project({ ...onTrack, monthsRemaining: 3, monthlyE18: 0n });
  assert.ok(p.requiredMonthlyE18 * 3n >= usd(10_000), "three of these must cover the gap");
});

test("the target is carried on the result so margins can be described", () => {
  assert.equal(project(onTrack).targetE18, usd(20_000));
});

test("percent complete is a percentage of the target, not of the projection", () => {
  assert.equal(project(onTrack).percentComplete, 50);
  assert.equal(project({ ...onTrack, savedE18: 0n }).percentComplete, 0);
});

// ------------------------------------------------------------------- scenarios

test("the questions offered are scaled to the person's own numbers", () => {
  const scenarios = defaultScenarios(onTrack);
  const kinds = scenarios.map((s) => s.kind);
  assert.ok(kinds.includes("add_more"));
  assert.ok(kinds.includes("finish_earlier"));
  assert.ok(kinds.includes("pause_contributions"));

  for (const s of scenarios) {
    assert.match(s.question, /^What if/, "a scenario is a question, not a setting");
    assert.ok(s.question.endsWith("?"));
  }
});

test("adding more closes the gap and says so in a sentence", () => {
  const behind: ProjectionInputs = { ...onTrack, monthlyE18: usd(100) };
  const result = runScenario(behind, { kind: "add_more", question: "", amount: 100 });

  assert.equal(result.changed.shortfallE18, 0n);
  assert.equal(result.fixesTheGoal, true);
  assert.match(result.answer, /gets you there/i);
  assert.ok(result.differences.length > 0, "and shows what moved");
});

test("adding less is reported as a setback, with the new gap", () => {
  const result = runScenario(onTrack, { kind: "add_less", question: "", amount: 100 });
  assert.ok(result.changed.shortfallE18 > 0n);
  assert.equal(result.fixesTheGoal, false);
  assert.match(result.answer, /short/i);
});

test("more time helps; less time hurts", () => {
  const behind: ProjectionInputs = { ...onTrack, monthlyE18: usd(100) };
  const later = runScenario(behind, { kind: "finish_later", question: "", months: 12 });
  const earlier = runScenario(behind, { kind: "finish_earlier", question: "", months: 12 });

  assert.ok(later.changed.shortfallE18 < behind.targetE18, "more months means more contributions");
  assert.ok(
    earlier.changed.shortfallE18 > later.changed.shortfallE18,
    "and fewer months means fewer",
  );
});

test("pausing contributions removes the months it covers", () => {
  const paused = applyScenario(onTrack, { kind: "pause_contributions", question: "", months: 6 });
  assert.equal(paused.monthsRemaining, 44, "the date does not move; six months of adding are lost");
  assert.equal(paused.monthlyE18, onTrack.monthlyE18, "and the amount itself is unchanged");
});

test("a pause that breaks an on-track plan says exactly how short it leaves them", () => {
  const result = runScenario(onTrack, { kind: "pause_contributions", question: "", months: 6 });
  assert.equal(result.changed.shortfallE18, usd(1_200), "six months at $200");
  assert.match(result.answer, /\$1,?200(\.00)? short|short/i);
});

test("raising the target is answered against the new target", () => {
  const result = runScenario(onTrack, { kind: "raise_target", question: "", amount: 30_000 });
  assert.equal(result.changed.targetE18, usd(30_000));
  assert.equal(result.changed.shortfallE18, usd(10_000));
  assert.match(result.answer, /short/i);
});

test("a change that helps but does not fix it says both things", () => {
  const far: ProjectionInputs = { ...onTrack, monthlyE18: 0n };
  const result = runScenario(far, { kind: "add_more", question: "", amount: 50 });
  assert.ok(result.changed.shortfallE18 > 0n);
  assert.equal(result.fixesTheGoal, false);
  assert.match(result.answer, /closer/i, "it should acknowledge the improvement");
  assert.match(result.answer, /still/i, "and still be clear it is not enough");
});

test("a scenario never changes more than one thing", () => {
  const scenarios: Scenario[] = [
    { kind: "add_more", question: "", amount: 100 },
    { kind: "finish_later", question: "", months: 12 },
    { kind: "raise_target", question: "", amount: 30_000 },
  ];
  for (const scenario of scenarios) {
    const after = applyScenario(onTrack, scenario);
    const changed = (["savedE18", "targetE18", "monthlyE18", "monthsRemaining"] as const).filter(
      (key) => after[key] !== onTrack[key],
    );
    assert.equal(changed.length, 1, `${scenario.kind} changed ${changed.join(", ")}`);
  }
});

test("money a person adds is never touched by a scenario", () => {
  for (const scenario of defaultScenarios(onTrack)) {
    assert.equal(
      applyScenario(onTrack, scenario).savedE18,
      onTrack.savedE18,
      `${scenario.kind} must not invent or remove money already saved`,
    );
  }
});

test("no answer anywhere implies a return", () => {
  const forbidden = /\b(projected return|expected return|interest|APY|APR|yield|compound|guarantee)\b/i;
  const cases: ProjectionInputs[] = [onTrack, { ...onTrack, monthlyE18: usd(50) }, { ...onTrack, monthlyE18: 0n }];
  for (const inputs of cases) {
    for (const scenario of defaultScenarios(inputs)) {
      const { answer } = runScenario(inputs, scenario);
      assert.ok(!forbidden.test(answer), `"${answer}" implies a return`);
    }
  }
});

test("the same inputs always give the same answer", () => {
  const scenario: Scenario = { kind: "add_more", question: "", amount: 100 };
  const a = runScenario(onTrack, scenario);
  const b = runScenario(onTrack, scenario);
  assert.deepEqual(a.answer, b.answer);
  assert.deepEqual(a.differences, b.differences);
});
