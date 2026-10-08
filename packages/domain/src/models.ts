/**
 * The Modalis domain model.
 *
 *   GOAL -> PLAN -> MONEY -> PROGRESS -> ADJUSTMENTS -> ACTIVITY
 *
 * These are the only shapes a UI should ever need. Nothing here mentions a mandate, a vault, an
 * adapter, a nonce or a chain. The protocol objects those come from live under `@modalis/chain`
 * and are translated in `translate.ts`.
 *
 * Conventions chosen for a consumer surface:
 *
 *  - **Money is a `Money` object**, never a bare number: a decimal string plus its currency. The
 *    string keeps full precision (the protocol works in 1e18 fixed point and uint256 token
 *    amounts, which no JS number can hold) while staying trivial for a UI to render.
 *  - **Percentages are percentages.** 30 means 30%, not 3000 basis points. One decimal place,
 *    which is the resolution a person can act on.
 *  - **Dates are ISO strings.** No unix seconds.
 *  - **Every status is a word, not a code.** "on_track", not a number.
 */

export type Money = {
  /** Decimal string, full precision. e.g. "11031.67". Parse with a decimal library, not Number. */
  amount: string;
  currency: "USD";
};

export const money = (amount: string): Money => ({ amount, currency: "USD" });

/** USD at 1e18 fixed point -> a display-safe decimal string, without going through a float. */
export function moneyFromE18(valueE18: bigint, decimalPlaces = 2): Money {
  const negative = valueE18 < 0n;
  const abs = negative ? -valueE18 : valueE18;
  const whole = abs / 10n ** 18n;
  const frac = (abs % 10n ** 18n).toString().padStart(18, "0").slice(0, decimalPlaces);
  const text = decimalPlaces > 0 ? `${whole}.${frac}` : `${whole}`;
  return money(negative ? `-${text}` : text);
}

/**
 * Money as it appears inside a SENTENCE: "$8,968".
 *
 * Grouped and rounded to whole dollars, because cents inside prose are noise — "$8,968.33 away"
 * reads as a machine talking. Tables and figures keep their cents; this is only for copy.
 *
 * Grouping is done by hand rather than through `toLocaleString`, so the same sentence comes out
 * identically on a server in any locale and in any browser.
 */
export function moneyInSentence(value: Money): string {
  const [whole = "0"] = value.amount.split(".");
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}`;
}

/** Basis points -> a percentage number. 3000 -> 30. */
export const percentFromBps = (bps: number, decimalPlaces = 1): number =>
  Number((bps / 100).toFixed(decimalPlaces));

// ----------------------------------------------------------------------- GOAL

export type GoalKind =
  | "house"
  | "education"
  | "long_term_wealth"
  | "emergency_reserve"
  | "retirement"
  | "major_purchase"
  | "travel"
  | "custom";

/** What the person is saving for. The starting point of everything. */
export type Goal = {
  id: string | null;
  kind: GoalKind;
  /** Short human label, e.g. "A home". */
  name: string;
  /** The person's own words, when they gave them. */
  description?: string;
  target: Money;
  /** ISO date. */
  targetDate: string;
  monthsRemaining: number;
  startingAmount: Money;
  contribution: { amount: Money; cadence: "weekly" | "monthly" | "quarterly" };
};

// ----------------------------------------------------------------------- PLAN

export type RiskLevelName = "cautious" | "balanced" | "adventurous";

export type RiskLevel = {
  level: RiskLevelName;
  /** 0-100. Shown only where a number genuinely helps. */
  score: number;
  /** Plain sentences explaining how this level was reached. */
  reasons: string[];
};

/** One investment inside the plan, and how much of the money belongs in it. */
export type PlanHolding = {
  /** Internal token identifier. Opaque to the UI; needed to act on this holding. */
  id: string;
  /** What the person sees, e.g. "Cash". */
  name: string;
  /** Short code, e.g. "mUSD". Useful in dense lists. */
  code: string;
  /** Share of the plan, as a percentage. */
  sharePercent: number;
  /** The band this holding is allowed to move within before an adjustment is due. */
  allowedRange: { minPercent: number; maxPercent: number };
  /** True when this counts toward the money kept available. */
  isAvailableCash: boolean;
};

/** The boundaries the person approved. Modalis cannot act outside these. */
export type PlanRules = {
  /** "Maximum in one investment" */
  maxInOneInvestmentPercent: number;
  /** "Money kept available" */
  moneyKeptAvailablePercent: number;
  /** "How much you're comfortable losing" */
  comfortableLosingPercent: number;
  /** "When Modalis steps in" */
  adjustWhenOffTargetByPercent: number;
};

export type PlanStatus = "draft" | "active" | "paused";

/** The rules Modalis manages the money by. Only the person can change them. */
export type Plan = {
  id: string | null;
  status: PlanStatus;
  /** Increments each time the person changes their plan. */
  version: number;
  riskLevel: RiskLevel;
  /** "How your money is spread" */
  howMoneyIsSpread: PlanHolding[];
  rules: PlanRules;
  goal: Goal;
  /** Plain-language summary of the whole plan, for the approval screen. */
  summary: string;
  /** Set once the plan is live. */
  approvedAt?: string;
  /**
   * Whether Modalis is currently allowed to suggest adjustments for this person.
   * False means they have not granted that permission, or have withdrawn it.
   */
  adjustmentsEnabled: boolean;
};

// ---------------------------------------------------------------------- MONEY

export type Holding = {
  id: string;
  name: string;
  code: string;
  value: Money;
  /** Share of the total, as a percentage. */
  sharePercent: number;
  /** Where the plan wants this to be. */
  targetPercent: number;
  /** Positive means more than planned. */
  offTargetByPercent: number;
  isAvailableCash: boolean;
  /** How much of the investment is held. Decimal string in that investment's own units. */
  units: string;
};

/** What the person actually has right now. Read live; never cached as truth. */
export type MoneyView = {
  total: Money;
  /** The part held as cash-like and easy to withdraw. */
  available: Money;
  /** The part at work in investments. */
  invested: Money;
  holdings: Holding[];
  /** True before any money has been put in. */
  isEmpty: boolean;
  /** When this was read, so a UI can show freshness honestly. */
  asOf: string;
};

// ------------------------------------------------------------------- PROGRESS

export type ProgressStatus = "not_started" | "on_track" | "slightly_behind" | "behind";

/** Am I going to get there? Deliberately free of any projected return. */
export type Progress = {
  status: ProgressStatus;
  saved: Money;
  target: Money;
  percentComplete: number;
  monthsRemaining: number;
  targetDate: string;
  /** Still to find, after what is already saved. */
  remaining: Money;
  /**
   * What the person would need to add each month to reach the target assuming NO growth.
   * Modalis never promises a return, so the honest figure is the one that assumes none.
   */
  monthlyToStayOnTrack: Money;
  /** Their current planned contribution, for comparison. */
  currentMonthlyContribution: Money;
  /** One sentence a person can act on. */
  summary: string;
};

// ----------------------------------------------------------------- ADJUSTMENT

export type PlanHealth = "on_plan" | "drifting" | "off_plan";

/** Why an adjustment is needed, in the person's terms. */
export type PlanIssue = {
  /** Stable code for the UI to branch on. */
  code: "too_much_in_one" | "outside_allowed_range" | "not_enough_available" | "off_target";
  /** The investment involved, when the issue is about one. */
  holdingName?: string;
  /** What it is now. */
  currentPercent: number;
  /** What the plan allows. */
  limitPercent: number;
  /** One sentence. */
  message: string;
};

export type AdjustmentStatus =
  | "none_needed"
  | "recommended"
  | "not_allowed"
  | "no_safe_option"
  | "executing"
  | "done"
  | "failed";

/** A receipt for something that happened. The only place a chain detail surfaces. */
export type Receipt = {
  /** Transaction hash. Named for what it is to a person: proof. */
  reference: string;
  /** Explorer link, when one is configured. */
  url?: string;
  confirmed: boolean;
  at?: string;
};

/** What Modalis suggests doing, and whether the person's rules allow it. */
export type Adjustment = {
  id: string | null;
  status: AdjustmentStatus;
  /** Why this is being suggested. */
  reasons: PlanIssue[];
  /** Plain-language explanation shown to the person. */
  explanation: string;
  /** What would change, if anything. */
  change?: {
    sell: { name: string; code: string; amount: string };
    buy: { name: string; code: string; atLeast: string };
    /** Where each holding sits now and where it would sit after. */
    before: { name: string; percent: number }[];
    after?: { name: string; percent: number }[];
  };
  /**
   * Whether the person's own approved rules permit this. Checked against the contract before
   * anything is submitted, so a "false" here is the rules protecting them, not an error.
   */
  allowedByYourRules: boolean;
  /** Present when the rules refused it: what rule, in plain language. */
  blockedBecause?: string;
  receipt?: Receipt;
};

// ------------------------------------------------------------------- ACTIVITY

export type ActivityKind =
  | "plan_created"
  | "plan_changed"
  | "plan_paused"
  | "money_added"
  | "money_withdrawn"
  | "adjustment_made"
  | "adjustment_blocked"
  | "checkup";

/** The story of what has happened, newest first. */
export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  /** Short headline, e.g. "Money added". */
  title: string;
  /** One sentence of detail. */
  detail: string;
  at: string;
  amount?: Money;
  receipt?: Receipt;
};

// -------------------------------------------------------------------- FUNDING

export type FundingStepKind = "allow" | "add";
export type FundingStepStatus = "pending" | "in_progress" | "done" | "failed";

/**
 * One step of putting money in. Adding money takes two actions per investment — permission, then
 * the transfer — and the person should see that as progress, not as jargon.
 */
export type FundingStep = {
  id: string;
  kind: FundingStepKind;
  holdingName: string;
  holdingId: string;
  /** Units of that investment, as a decimal string, for display. */
  units: string;
  /**
   * The same amount as an exact integer in that investment's smallest unit. The wallet needs
   * this to act: converting the display string back would go through a float and lose precision.
   */
  rawUnits: string;
  value: Money;
  status: FundingStepStatus;
  /** What this step does, in one sentence. */
  description: string;
  receipt?: Receipt;
  error?: string;
};

/** The whole "put money in" operation, broken into steps a UI can walk through. */
export type FundingPlan = {
  /** Total being added. */
  total: Money;
  steps: FundingStep[];
  /** True when the person's wallet does not hold enough of something. */
  hasShortfall: boolean;
  shortfalls: { holdingName: string; needs: string; has: string }[];
};

// --------------------------------------------------------------- SYSTEM STATE

/**
 * Whether the product can currently do each thing, and if not, why — in plain language.
 * Lets a UI disable an action with a real reason instead of failing on press.
 */
export type Capabilities = {
  canCreatePlan: boolean;
  canFund: boolean;
  canAdjust: boolean;
  /** Human reasons for anything that is false. */
  limitations: string[];
};
