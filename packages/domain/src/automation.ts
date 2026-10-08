/**
 * How much Modalis may do without asking (§33), and the wait before it may do more (§18).
 *
 *   guided     Modalis suggests. It carries out nothing, even when asked to.
 *   assisted   Modalis prepares a change and explains it; it runs once the person approves.
 *   automated  Modalis may carry out a change the person's plan allows, without asking first.
 *
 * Automation never widens what is allowed. An automated change is still checked by the contract
 * holding the person's limits, still refused while the plan is paused, and still needs the
 * on-chain permission the person granted. It removes the tap, not the rules.
 *
 * RAISING authority is timelocked: it takes effect only after a wait, so a hijacked session
 * cannot switch it on and act in the same minute, and the person has time to notice and cancel.
 * LOWERING authority is immediate. Taking power away must never have to wait.
 */
export type AutomationLevel = "guided" | "assisted" | "automated";

const RANK: Record<AutomationLevel, number> = { guided: 0, assisted: 1, automated: 2 };

/** How long a request for MORE authority waits before it takes effect. */
export const AUTOMATION_DELAY_HOURS = 24;

export type AutomationState = {
  level: AutomationLevel;
  requestedLevel: AutomationLevel | null;
  /** ISO timestamp the requested level takes effect. */
  effectiveAt: string | null;
};

export const DEFAULT_AUTOMATION: AutomationState = { level: "assisted", requestedLevel: null, effectiveAt: null };

/** What the person asked for, applied: a raise is scheduled, a lowering is immediate. */
export function requestAutomation(
  current: AutomationState,
  wanted: AutomationLevel,
  now: Date,
  delayHours = AUTOMATION_DELAY_HOURS,
): AutomationState {
  const live = effectiveAutomation(current, now);
  if (RANK[wanted] <= RANK[live.level]) {
    // Lowering (or staying): immediate, and it cancels any raise that was waiting.
    return { level: wanted, requestedLevel: null, effectiveAt: null };
  }
  // Raising: keep the current level until the wait is over. Asking again does not restart a
  // wait that is already running for the same level — it is the same request.
  if (live.requestedLevel === wanted && live.effectiveAt) return live;
  return {
    level: live.level,
    requestedLevel: wanted,
    effectiveAt: new Date(now.getTime() + delayHours * 3600_000).toISOString(),
  };
}

/** The level actually in force at `now`, promoting a pending raise whose wait is over. */
export function effectiveAutomation(state: AutomationState, now: Date): AutomationState {
  if (state.requestedLevel && state.effectiveAt && new Date(state.effectiveAt).getTime() <= now.getTime()) {
    return { level: state.requestedLevel, requestedLevel: null, effectiveAt: null };
  }
  return state;
}

export type AutoDecision = { run: true } | { run: false; why: string };

/**
 * May a proposed adjustment run without the person approving it? Every condition must hold; the
 * first that fails is the reason, in words.
 */
export function mayRunWithoutAsking(input: {
  automation: AutomationState;
  now: Date;
  /** The on-chain simulation against the person's own limits passed. */
  allowedByRules: boolean;
  planPaused: boolean;
  /** The person granted Modalis permission to act, on-chain. */
  permissionGranted: boolean;
  /** The operator has enabled automatic execution on this deployment at all. */
  operatorEnabled: boolean;
}): AutoDecision {
  const level = effectiveAutomation(input.automation, input.now).level;
  if (!input.operatorEnabled) return { run: false, why: "Automatic changes are switched off on this deployment." };
  if (level !== "automated") return { run: false, why: "You haven't chosen automatic changes." };
  if (input.planPaused) return { run: false, why: "Your plan is paused." };
  if (!input.permissionGranted) return { run: false, why: "You haven't given Modalis permission to act." };
  if (!input.allowedByRules) return { run: false, why: "Your own rules refuse this change." };
  return { run: true };
}

/** Guided means suggestions only: Modalis carries out nothing, even on request. */
export function mayExecuteOnRequest(state: AutomationState, now: Date): boolean {
  return effectiveAutomation(state, now).level !== "guided";
}
