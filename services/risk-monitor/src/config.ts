/**
 * Risk-monitor configuration.
 *
 * Two distinct keys, with deliberately different authority:
 *
 *   MANAGER_PRIVATE_KEY        may ONLY call RebalanceExecutor.execute. It cannot withdraw and
 *                              cannot change a mandate — PortfolioMandate keys both off
 *                              msg.sender, so this is enforced on-chain, not by convention here.
 *   ORACLE_UPDATER_PRIVATE_KEY demo only. Pushes MockPriceOracle prices for the controlled
 *                              scenario. Must not exist on mainnet.
 *
 * The monitor refuses to start on mainnet with DEMO_MODE enabled.
 */
import { deploymentFromEnv, rpcConfigFromEnv, type Deployment, type RpcConfig } from "@modalis/chain";
import { getAddress, isAddress, type Address } from "viem";

export type MonitorConfig = {
  rpc: RpcConfig;
  deployment: Deployment;
  managerPrivateKey?: string;
  oracleUpdaterPrivateKey?: string;
  /** Portfolios to watch. Empty means "discover from on-chain events". */
  owners: Address[];
  intervalSeconds: number;
  demoMode: boolean;
  /** When false the monitor reports and proposes but never submits a transaction. */
  autoExecute: boolean;
  ai: { apiKey?: string; model?: string };
};

export function loadConfig(env: Record<string, string | undefined> = process.env): MonitorConfig {
  const rpc = rpcConfigFromEnv(env);
  const deployment = deploymentFromEnv(rpc.chainId, env);
  const demoMode = (env.DEMO_MODE ?? "false").toLowerCase() === "true";

  if (demoMode && rpc.chainId === 143) {
    throw new Error("DEMO_MODE must be false on Monad mainnet: the scenario engine pushes synthetic prices.");
  }

  const owners = (env.MODALIS_WATCH_OWNERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (!isAddress(s)) throw new Error(`MODALIS_WATCH_OWNERS contains an invalid address: ${s}`);
      return getAddress(s);
    });

  return {
    rpc,
    deployment,
    managerPrivateKey: env.MANAGER_PRIVATE_KEY,
    oracleUpdaterPrivateKey: env.ORACLE_UPDATER_PRIVATE_KEY,
    owners,
    intervalSeconds: Number(env.RISK_MONITOR_INTERVAL_SECONDS ?? 60),
    demoMode,
    // Submitting a transaction is opt-in, so a misconfigured monitor cannot trade by surprise.
    autoExecute: (env.RISK_MONITOR_AUTO_EXECUTE ?? "false").toLowerCase() === "true",
    ai: { apiKey: env.AI_API_KEY, model: env.AI_MODEL },
  };
}
