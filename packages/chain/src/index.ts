/**
 * @modalis/chain — the only place the application talks to Monad.
 *
 * Everything here is typed against ABIs generated from the compiled contracts
 * (scripts/sync-abis.mjs), so the app can never drift from what is deployed.
 */
export * from "./abis/index.ts";
export * from "./addresses.ts";
export * from "./chains.ts";
export * from "./clients.ts";
export * from "./agent-env.ts";
export * from "./events.ts";
export * from "./owner.ts";
export * from "./portfolio.ts";
export * from "./proposals.ts";
export * from "./faucet.ts";
export * from "./circles.ts";
