/**
 * @modalis/risk-monitor — the control loop, as a library.
 *
 * The runnable CLI lives in `cli.ts`. Keeping it out of the package entry point matters: importing
 * this module must never start a monitoring loop as a side effect, and before this split the only
 * way to use `evaluate` from another package was a deep path into src/.
 */
export * from "./monitor.ts";
export * from "./scenario.ts";
export * from "./config.ts";
