/**
 * Will I get there, and what would change it?
 *
 * The honest-answer rule, and the reason this file has no interest rate in it:
 *
 *   **Every figure here assumes ZERO investment growth.**
 *
 * Modalis does not know what the market will do. A product that quietly compounds 7% a year turns
 * a guess into a promise, and the person only finds out it was a guess at the end. So the only
 * forward-looking number this engine will state is one the person controls completely: money they
 * themselves add. If the plan grows, they arrive early — which is a good surprise, and the only
 * direction a surprise should go in a goal product.
 *
 * Pure functions over bigint, with no chain and no clock of their own. That makes every answer
 * reproducible: the same inputs give the same sentence, today and in a test.
 */
import { moneyFromE18, type Money } from "./models.ts";

const E18 = 10n ** 18n;

/** Everything a projection needs. All money is USD at 1e18. */
export type ProjectionInputs = {
  /** What they have in the plan now. */
  savedE18: bigint;
  /** What they are aiming for. */
  targetE18: bigint;
  /** What they add each month. */
  monthlyE18: bigint;
  /** Whole months until the date they need it. */
  monthsRemaining: number;
};

export type GoalHealth = "not_started" | "on_track" | "needs_attention" | "off_track";

export type Projection = {
  health: GoalHealth;
  /** Echoed back so a caller can talk about the margin without re-threading the inputs. */
  targetE18: bigint;
  /** Where they would land on the target date, adding nothing beyond the current plan. */
  projectedE18: bigint;
  projected: Money;
  /** Short by this much on the target date. Zero when they arrive. */
  shortfallE18: bigint;
  shortfall: Money;
  /** What they would need to add each month to arrive exactly on time. */
  requiredMonthlyE18: bigint;
  requiredMonthly: Money;
  /** The difference between that and what they add today. Zero when they are on track. */
  extraMonthlyE18: bigint;
  extraMonthly: Money;
  /**
   * Months until they reach the target at the current contribution. Null when the contribution is
   * zero and the goal is not already met — there is no honest finite answer to give.
   */
  monthsToReach: number | null;
  /** 0-100, capped: "142% complete" helps nobody. */
  percentComplete: number;
};

/** Rounds up: arriving a month early is fine, a month late is the thing being avoided. */
function divideRoundingUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) return numerator;
  return (numerator + denominator - 1n) / denominator;
}

export function project(inputs: ProjectionInputs): Projection {
  const { savedE18, targetE18, monthlyE18 } = inputs;
  const months = Math.max(0, Math.floor(inputs.monthsRemaining));

  const contributions = monthlyE18 * BigInt(months);
  const projectedE18 = savedE18 + contributions;
  const shortfallE18 = targetE18 > projectedE18 ? targetE18 - projectedE18 : 0n;

  const stillNeeded = targetE18 > savedE18 ? targetE18 - savedE18 : 0n;
  const requiredMonthlyE18 = months > 0 ? divideRoundingUp(stillNeeded, BigInt(months)) : stillNeeded;
  const extraMonthlyE18 =
    requiredMonthlyE18 > monthlyE18 ? requiredMonthlyE18 - monthlyE18 : 0n;

  let monthsToReach: number | null;
  if (stillNeeded === 0n) monthsToReach = 0;
  else if (monthlyE18 <= 0n) monthsToReach = null;
  else monthsToReach = Number(divideRoundingUp(stillNeeded, monthlyE18));

  const percentComplete =
    targetE18 === 0n
      ? 0
      : Math.min(100, Number(((savedE18 * 10_000n) / targetE18).toString()) / 100);

  return {
    health: healthFrom({ savedE18, targetE18, shortfallE18, requiredMonthlyE18, monthlyE18, months }),
    targetE18,
    projectedE18,
    projected: moneyFromE18(projectedE18),
    shortfallE18,
    shortfall: moneyFromE18(shortfallE18),
    requiredMonthlyE18,
    requiredMonthly: moneyFromE18(requiredMonthlyE18),
    extraMonthlyE18,
    extraMonthly: moneyFromE18(extraMonthlyE18),
    monthsToReach,
    percentComplete: Number(percentComplete.toFixed(1)),
  };
}

/**
 * Three states, because that is how many a person can act on.
 *
 * The 10% band for "needs attention" is a judgement, and it is the right kind: a plan that is
 * 2% short does not deserve a red screen, and one that is 40% short should not read as "nearly
 * there". Stated here rather than buried so it can be argued with.
 */
function healthFrom(x: {
  savedE18: bigint;
  targetE18: bigint;
  shortfallE18: bigint;
  requiredMonthlyE18: bigint;
  monthlyE18: bigint;
  months: number;
}): GoalHealth {
  if (x.savedE18 === 0n && x.monthlyE18 === 0n) return "not_started";
  if (x.shortfallE18 === 0n) return "on_track";
  // Past the date and still short is off track, whatever the size of the gap.
  if (x.months === 0) return "off_track";
  const withinTenPercent = x.monthlyE18 * 10n >= x.requiredMonthlyE18 * 9n;
  return withinTenPercent ? "needs_attention" : "off_track";
}

// ------------------------------------------------------------------- scenarios

/**
 * The questions a person actually asks about a goal.
 *
 * Deliberately a closed set. A free-form "what if" box invites questions this engine cannot answer
 * honestly — "what if the market goes up 20%" has no answer that is not a guess.
 */
export type ScenarioKind =
  | "add_more"
  | "add_less"
  | "finish_later"
  | "finish_earlier"
  | "raise_target"
  | "lower_target"
  | "pause_contributions";

export type Scenario = {
  kind: ScenarioKind;
  /** The question in the person's words, for the UI to render as the choice. */
  question: string;
  /** Dollars, for the contribution and target scenarios. */
  amount?: number;
  /** Months, for the date scenarios. */
  months?: number;
};

export type ScenarioResult = {
  scenario: Scenario;
  /** The plan as it stands. */
  now: Projection;
  /** The plan with that one change. */
  changed: Projection;
  /** What moved, in one sentence. */
  answer: string;
  /** The specific differences, for a UI that wants to show them side by side. */
  differences: { label: string; before: string; after: string }[];
  /** True when the change takes the person from not arriving to arriving. */
  fixesTheGoal: boolean;
};

/** The default set of questions, scaled to the person's own numbers. */
export function defaultScenarios(inputs: ProjectionInputs): Scenario[] {
  const monthly = Number(moneyFromE18(inputs.monthlyE18, 0).amount);
  const target = Number(moneyFromE18(inputs.targetE18, 0).amount);
  // A step that is meaningful against what they already add, rounded to something sayable.
  const step = Math.max(25, Math.round(Math.max(monthly * 0.25, 50) / 25) * 25);

  return [
    { kind: "add_more", question: `What if I add $${step} more each month?`, amount: step },
    { kind: "add_less", question: `What if I add $${step} less each month?`, amount: step },
    { kind: "finish_later", question: "What if I give myself another year?", months: 12 },
    { kind: "finish_earlier", question: "What if I need it a year sooner?", months: 12 },
    {
      kind: "raise_target",
      question: `What if I aim for $${Math.round((target * 1.25) / 100) * 100} instead?`,
      amount: Math.round((target * 1.25) / 100) * 100,
    },
    { kind: "pause_contributions", question: "What if I have to stop adding for 6 months?", months: 6 },
  ];
}

function usd(dollars: number): bigint {
  // Through a string so a float never touches the amount.
  const text = Math.max(0, dollars).toFixed(2);
  const [whole, frac = "0"] = text.split(".");
  return BigInt(whole) * E18 + BigInt(frac.padEnd(18, "0"));
}

/** Applies one change to the inputs. Nothing else moves. */
export function applyScenario(inputs: ProjectionInputs, scenario: Scenario): ProjectionInputs {
  const months = scenario.months ?? 0;
  switch (scenario.kind) {
    case "add_more":
      return { ...inputs, monthlyE18: inputs.monthlyE18 + usd(scenario.amount ?? 0) };
    case "add_less": {
      const less = usd(scenario.amount ?? 0);
      return { ...inputs, monthlyE18: inputs.monthlyE18 > less ? inputs.monthlyE18 - less : 0n };
    }
    case "finish_later":
      return { ...inputs, monthsRemaining: inputs.monthsRemaining + months };
    case "finish_earlier":
      return { ...inputs, monthsRemaining: Math.max(0, inputs.monthsRemaining - months) };
    case "raise_target":
      return { ...inputs, targetE18: usd(scenario.amount ?? 0) };
    case "lower_target":
      return { ...inputs, targetE18: usd(scenario.amount ?? 0) };
    case "pause_contributions":
      // A pause does not shorten the goal; it removes the months of contributions it covers.
      return { ...inputs, monthsRemaining: Math.max(0, inputs.monthsRemaining - months) };
  }
}

export function runScenario(inputs: ProjectionInputs, scenario: Scenario): ScenarioResult {
  const now = project(inputs);
  const changed = project(applyScenario(inputs, scenario));

  const differences: { label: string; before: string; after: string }[] = [];
  const add = (label: string, before: string, after: string) => {
    if (before !== after) differences.push({ label, before, after });
  };

  add("Where you'd land", `$${now.projected.amount}`, `$${changed.projected.amount}`);
  add("Short by", `$${now.shortfall.amount}`, `$${changed.shortfall.amount}`);
  add(
    "Needed each month",
    `$${now.requiredMonthly.amount}`,
    `$${changed.requiredMonthly.amount}`,
  );
  add("How it's going", healthLabel(now.health), healthLabel(changed.health));

  return {
    scenario,
    now,
    changed,
    answer: answerFor(scenario, now, changed),
    differences,
    fixesTheGoal: now.shortfallE18 > 0n && changed.shortfallE18 === 0n,
  };
}

export function healthLabel(health: GoalHealth): string {
  switch (health) {
    case "not_started":
      return "Not started";
    case "on_track":
      return "On track";
    case "needs_attention":
      return "Needs attention";
    case "off_track":
      return "Off track";
  }
}

/**
 * The sentence a person reads.
 *
 * Answers the question that was asked, rather than reporting the numbers that changed. "You'd get
 * there about seven months early" is the answer; "projected value increased by $4,200" is a
 * calculation someone still has to interpret.
 */
function answerFor(scenario: Scenario, now: Projection, changed: Projection): string {
  const arrivesNow = now.shortfallE18 === 0n;
  const arrivesAfter = changed.shortfallE18 === 0n;

  if (!arrivesNow && arrivesAfter) {
    return "That gets you there. On this change you'd reach your goal on time.";
  }
  if (arrivesNow && !arrivesAfter) {
    return `That would leave you about $${changed.shortfall.amount} short of your goal.`;
  }
  if (!arrivesNow && !arrivesAfter) {
    const before = now.shortfallE18;
    const after = changed.shortfallE18;
    if (after < before) {
      const closed = moneyFromE18(before - after, 0).amount;
      return `Closer — it closes about $${closed} of the gap, but you'd still be $${changed.shortfall.amount} short.`;
    }
    if (after > before) {
      return `That sets you back. You'd be about $${changed.shortfall.amount} short instead of $${now.shortfall.amount}.`;
    }
    return `That doesn't change the gap. You'd still be about $${changed.shortfall.amount} short.`;
  }

  // Already arriving in both cases: the interesting difference is the margin.
  const spare = changed.projectedE18 - changed.targetE18;
  if (scenario.kind === "finish_earlier") {
    return "You'd still get there, even with less time.";
  }
  if (spare > 0n) {
    return `You'd still reach your goal, with about $${moneyFromE18(spare, 0).amount} to spare.`;
  }
  return "You'd still reach your goal, with very little to spare.";
}
