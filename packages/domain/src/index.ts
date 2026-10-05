/**
 * @modalis/domain — the product.
 *
 *   GOAL -> PLAN -> MONEY -> PROGRESS -> ADJUSTMENTS -> ACTIVITY
 *
 * This is the layer a user interface talks to. It speaks the product's language and nothing
 * else: no mandates, no vaults, no basis points, no transaction hashes except as receipts.
 *
 * Underneath, unchanged: PortfolioMandate enforces the rules, PortfolioVault holds the money,
 * RebalanceExecutor validates every action, Kuru settles trades, Chainlink CRE publishes verified
 * risk state, Envio indexes history, and Monad settles all of it. The sophistication stays; it
 * just stops being the user's problem.
 */
export * from "./terms.ts";
export * from "./models.ts";
export * from "./translate.ts";
export * from "./context.ts";
export * from "./projection.ts";
export * from "./services/goal.ts";
export * from "./services/plans.ts";
export * from "./services/money.ts";
export * from "./services/progress.ts";
export * from "./services/adjustments.ts";
export * from "./services/activity.ts";
