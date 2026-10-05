/**
 * @modalis/db — application state.
 *
 * The split that matters: Monad holds everything financial — balances, mandate rules, executions.
 * This database holds what was never on-chain: the goal in the user's own words, their interview
 * answers, prose explanations, rejected proposals (which emit nothing because they revert), and
 * caches that make history cheap to read.
 *
 * Every repository tolerates failure. The chain is the source of truth, so a failed write must
 * never reject a request that was otherwise about to succeed, and the product runs with no
 * database configured at all.
 */
export * from "./types.generated.ts";
export * from "./client.ts";
export * from "./errors.ts";
export * from "./repositories/users.ts";
export * from "./repositories/mandates.ts";
export * from "./repositories/activity.ts";
