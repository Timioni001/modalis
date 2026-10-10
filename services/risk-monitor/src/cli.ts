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
import { automationWallets, serverClient } from "@modalis/db";
import { getAddress, type Address } from "viem";
import { loadConfig } from "./config.ts";
import { consentFor, recordFinding } from "./consent.ts";
import { describeOutcome, evaluate, execute, type BuiltAction } from "./monitor.ts";

async function runOnce(): Promise<number> {
  const cfg = loadConfig();

  if (!isFullyDeployed(cfg.deployment)) {
    console.error(
      `Modalis is not deployed on chain ${cfg.deployment.chainId}. Run the deploy script and set the ` +
        "NEXT_PUBLIC_*_ADDRESS variables.",
    );
    return 1;
  }
  // With saved data, everyone who chose automatic changes is watched as well as any explicit list.
  const db = serverClient();
  const owners: Address[] = [...cfg.owners];
  if (db) {
    for (const w of await automationWallets(db)) {
      const a = getAddress(w.wallet);
      if (!owners.includes(a)) owners.push(a);
    }
  }
  if (owners.length === 0) {
    console.error("No portfolios to watch. Set MODALIS_WATCH_OWNERS, or let people choose automatic changes.");
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
  const ready: { owner: Address; action: BuiltAction }[] = [];
  for (const owner of owners) {
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
        await recordFinding(db, owner, "adjustment_blocked", action.simulation.explanation);
        continue;
      }

      // The person's own choice decides, not just the operator switch.
      const decision = await consentFor(db, owner, {
        operatorEnabled: cfg.autoExecute && Boolean(wallet),
        simulationOk: true,
      });
      if (!decision.run || !wallet) {
        console.log(`  not submitting: ${decision.run ? "no manager key" : decision.why}`);
        await recordFinding(db, owner, "adjustment_proposed", action.explanation);
        continue;
      }

      // Queued, not sent yet: every approved adjustment goes out together below.
      ready.push({ owner, action });
    } catch (err) {
      console.error(`${owner}: ${err instanceof Error ? err.message : String(err)}`);
      exitCode = 1;
    }
  }

  // Send every adjustment at once. Each one touches only its owner's plan, balances and nonce, so
  // Monad can run them side by side, and they typically land in the same block or the next one.
  // The manager wallet's nonce manager hands each one its own nonce, so they don't collide.
  if (ready.length > 0 && wallet) {
    const started = Date.now();
    const results = await Promise.all(
      ready.map(async ({ owner, action }) => ({ owner, action, result: await execute(wallet, client, cfg.deployment, action) })),
    );
    const blocks = new Set<string>();
    for (const { owner, action, result } of results) {
      if (result.submitted && result.hash && !result.rejectedWith) {
        blocks.add(String(result.blockNumber));
        console.log(`${owner}: settled in block ${result.blockNumber}: ${result.hash}`);
        await recordFinding(db, owner, "adjustment_executed", action.explanation, result.hash);
      } else {
        console.log(`${owner}: not settled: ${result.skipped ?? result.rejectedWith}`);
        exitCode = 1;
      }
    }
    console.log(
      `${results.length} adjustment(s) sent together, settled across ${blocks.size} block(s) in ${((Date.now() - started) / 1000).toFixed(1)}s.`,
    );
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
