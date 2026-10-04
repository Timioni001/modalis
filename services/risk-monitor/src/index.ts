#!/usr/bin/env node
/**
 * Risk monitor CLI.
 *
 *   node --experimental-strip-types src/index.ts once     evaluate every watched portfolio once
 *   node --experimental-strip-types src/index.ts watch     evaluate on RISK_MONITOR_INTERVAL_SECONDS
 *
 * Chainlink CRE runs the same evaluation on its own schedule and publishes the verified result
 * on-chain (see integrations/chainlink-cre). This service is the always-available path and the
 * one that actually submits proposals, because CRE deliberately only writes a signal.
 */
import { createManagerWalletClient, createMonadPublicClient, isFullyDeployed } from "@modalis/chain";
import { loadConfig } from "./config.ts";
import { describeOutcome, evaluate, execute } from "./monitor.ts";

async function runOnce(): Promise<number> {
  const cfg = loadConfig();

  if (!isFullyDeployed(cfg.deployment)) {
    console.error(
      `Modalis is not deployed on chain ${cfg.deployment.chainId}. Run the deploy script and set the ` +
        "NEXT_PUBLIC_*_ADDRESS variables.",
    );
    return 1;
  }
  if (cfg.owners.length === 0) {
    console.error("No portfolios to watch. Set MODALIS_WATCH_OWNERS to a comma-separated list of addresses.");
    return 1;
  }

  const client = createMonadPublicClient(cfg.rpc);
  const wallet = cfg.managerPrivateKey
    ? createManagerWalletClient(cfg.rpc, cfg.managerPrivateKey)
    : null;

  if (cfg.autoExecute && !wallet) {
    console.error("RISK_MONITOR_AUTO_EXECUTE is on but MANAGER_PRIVATE_KEY is not set.");
    return 1;
  }

  let exitCode = 0;
  for (const owner of cfg.owners) {
    try {
      const outcome = await evaluate({ client, deployment: cfg.deployment, ai: cfg.ai }, owner);
      console.log(describeOutcome(outcome));

      if (outcome.kind !== "action_needed" || !outcome.proposal) continue;

      const action = outcome.proposal;
      console.log(`  why: ${action.explanation}`);
      console.log(`  venue: ${action.venue.reason}`);

      if (!action.simulation.ok) {
        // Not an error: this is the mandate refusing an action, which is the system working.
        console.log(`  contract refused the proposal: ${action.simulation.errorName}`);
        console.log(`  ${action.simulation.explanation}`);
        continue;
      }

      if (!cfg.autoExecute || !wallet) {
        console.log("  not submitting (RISK_MONITOR_AUTO_EXECUTE is off)");
        continue;
      }

      const result = await execute(wallet, client, cfg.deployment, action);
      if (result.submitted && result.hash && !result.rejectedWith) {
        console.log(`  settled in block ${result.blockNumber}: ${result.hash}`);
      } else {
        console.log(`  not settled: ${result.skipped ?? result.rejectedWith}`);
        exitCode = 1;
      }
    } catch (err) {
      console.error(`${owner}: ${err instanceof Error ? err.message : String(err)}`);
      exitCode = 1;
    }
  }
  return exitCode;
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "once";

  if (mode === "once") {
    process.exit(await runOnce());
  }

  if (mode === "watch") {
    const { intervalSeconds } = loadConfig();
    console.log(`Modalis risk monitor: evaluating every ${intervalSeconds}s. Ctrl-C to stop.`);
    for (;;) {
      await runOnce().catch((err) => console.error(err));
      await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
    }
  }

  console.error(`Unknown mode "${mode}". Use "once" or "watch".`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
