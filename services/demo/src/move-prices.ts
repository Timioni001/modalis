#!/usr/bin/env node
/**
 * MODALIS — keep the demo market moving.
 *
 *   pnpm prices            # every 30 seconds, nudge mBTC, mETH and mBOND a little
 *   pnpm prices --once     # one nudge, then exit
 *   pnpm prices --reset    # put every price back where it started, then exit
 *
 * The demo oracle only changes when someone writes to it, so without this nothing ever drifts and
 * "Do it for me" never has anything to do. It also matters for a quieter reason: the oracle refuses
 * to quote a price older than its staleness window (one day as deployed), and a stale price stops
 * valuations and adjustments. Every tick rewrites every price, so they stay fresh.
 *
 * Prices are SYNTHETIC: a bounded random walk around the opening prices (see driftStep). Every
 * write is a real transaction on the network; the numbers are made up, and the app says so.
 *
 * Reads addresses from contracts/deployments/<chainId>.testnet.json (or <chainId>.json). Signs with
 * ORACLE_UPDATER_PRIVATE_KEY, or DEPLOYER_PRIVATE_KEY when that is unset. Refuses mainnet.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MockPriceOracleAbi,
  createManagerWalletClient,
  createMonadPublicClient,
  deploymentFromJson,
  requireContract,
  type Deployment,
} from "@modalis/chain";
import { DEMO_START_PRICES_E18, driftStep, resetScenario, runScenario } from "@modalis/risk-monitor";
import type { Address } from "viem";

const envPath = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
const REFRESH_ONLY = process.argv.includes("--refresh");

const CHAIN_ID = Number(process.env.CHAIN_ID ?? process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? 10143);
const RPC_URL =
  process.env.MODALIS_RPC_URL || process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";
const KEY = process.env.ORACLE_UPDATER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
const INTERVAL_SECONDS = Number(process.env.PRICE_INTERVAL_SECONDS ?? 30);

function loadDeployment(): Deployment {
  const root = resolve(import.meta.dirname, "../../..");
  for (const name of [`${CHAIN_ID}.testnet.json`, `${CHAIN_ID}.json`]) {
    const path = resolve(root, "contracts/deployments", name);
    if (existsSync(path)) return deploymentFromJson(JSON.parse(readFileSync(path, "utf8")));
  }
  throw new Error(`No contracts/deployments/${CHAIN_ID}.json. Deploy first (bash scripts/go-live.sh).`);
}

async function main() {
  if (CHAIN_ID === 143) throw new Error("Demo prices never run on Monad mainnet.");
  if (!KEY) throw new Error("Set ORACLE_UPDATER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY (the demo oracle's owner).");

  if (!Number.isFinite(INTERVAL_SECONDS) || INTERVAL_SECONDS < 10 || INTERVAL_SECONDS > 43_200) throw new Error("PRICE_INTERVAL_SECONDS must be between 10 and 43200.");
  const deployment = loadDeployment();
  const oracle = requireContract(deployment, "priceOracle");
  const rpc = { chainId: CHAIN_ID, httpUrl: RPC_URL };
  const client = createMonadPublicClient({ ...rpc, multicall: false });
  const wallet = createManagerWalletClient(rpc, KEY);

  const owner = (await client.readContract({
    address: oracle,
    abi: [{ type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }],
    functionName: "owner",
  })) as Address;
  if (owner.toLowerCase() !== wallet.account!.address.toLowerCase()) {
    throw new Error(`This key (${wallet.account!.address}) doesn't own the demo oracle; ${owner} does.`);
  }

  const tokens = deployment.tokens as Record<string, Address | undefined>;
  const moving = (Object.keys(DEMO_START_PRICES_E18) as (keyof typeof DEMO_START_PRICES_E18)[])
    .filter((s) => tokens[s])
    .map((symbol) => ({ symbol, token: tokens[symbol]!, start: DEMO_START_PRICES_E18[symbol] }));

  if (process.argv.includes("--reset")) {
    const all = { mBTC: tokens.mBTC!, mETH: tokens.mETH!, mBOND: tokens.mBOND!, mUSD: tokens.mUSD! };
    const r = await runScenario(wallet, client, deployment, resetScenario(all));
    console.log(`Prices reset (${r.writes.length} writes).`);
    return;
  }

  const tick = async () => {
    const steps = [];
    for (const m of moving) {
      const [current] = (await client.readContract({
        address: oracle,
        abi: MockPriceOracleAbi,
        functionName: "quotes",
        args: [m.token],
      })) as readonly [bigint, bigint];
      steps.push({ symbol: m.symbol, token: m.token, priceE18: REFRESH_ONLY ? (current || m.start) : driftStep(current || m.start, m.start) });
    }
    // Cash stays at $1, but is rewritten too so it never goes stale.
    if (tokens.mUSD) {
      const [cash] = await client.readContract({ address: oracle, abi: MockPriceOracleAbi, functionName: "quotes", args: [tokens.mUSD] });
      steps.push({ symbol: "mUSD", token: tokens.mUSD, priceE18: REFRESH_ONLY ? (cash || 10n ** 18n) : 10n ** 18n });
    }
    await runScenario(wallet, client, deployment, {
      id: "drift",
      title: REFRESH_ONLY ? "Refresh demo quotes" : "Simulated market drift",
      description: REFRESH_ONLY ? "Synthetic quotes refreshed without changing their values." : "Synthetic prices: a small bounded random walk.",
      steps,
    });
    const line = steps
      .filter((s) => s.symbol !== "mUSD")
      .map((s) => `${s.symbol} $${(Number(s.priceE18) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 })}`)
      .join("  ");
    console.log(`${new Date().toISOString().slice(11, 19)}  ${line}`);
  };

  await tick();
  if (process.argv.includes("--once")) return;
  console.log(`Moving demo prices every ${INTERVAL_SECONDS}s. Ctrl+C to stop.`);
  for (;;) {
    await new Promise((r) => setTimeout(r, INTERVAL_SECONDS * 1000));
    await tick().catch((err) => console.error(`  tick failed: ${err instanceof Error ? err.message : err}`));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
