/**
 * MODALIS — Chainlink CRE portfolio risk-monitoring workflow.
 *
 * On a cron schedule, for each watched portfolio:
 *
 *   read portfolio state (Monad) -> read mandate -> read asset metadata
 *     -> compute the risk state -> produce a DON-signed report
 *     -> write it to RiskSignalReceiver
 *
 * Why CRE and not just our own service: the risk state that reaches the chain carries DON
 * consensus, so the portfolio's published risk is not something Modalis' backend asserts on its
 * own. The same deterministic engine (packages/portfolio) runs here as in the app, which is what
 * makes consensus meaningful — every node computes the same answer from the same chain reads.
 *
 * SCOPE, deliberately narrow: this workflow writes a SIGNAL. It never moves funds. A rebalance
 * still requires a proposal that passes RebalanceExecutor's mandate validation, and
 * RiskSignalReceiver has no authority over the vault. Do not describe this as autonomous fund
 * movement, because it is not.
 */
import { cre, type Runtime } from "@chainlink/cre-sdk";
import { assessRisk, type Allocation, type MandateRules } from "@modalis/portfolio";
import type { Address, Hex } from "viem";
import {
  callAllocationsOf,
  callGetAsset,
  callMandateOf,
  callPortfolioState,
  decodeAllocations,
  decodeAsset,
  decodeMandate,
  decodePortfolioState,
  encodeRiskReport,
  hexToBase64,
  toHexFlexible,
  type RiskStatusCode,
} from "./abi.ts";

/** Chain selectors from the CRE SDK's own table. Monad testnet and mainnet are both supported. */
const CHAIN_SELECTORS = {
  "monad-testnet": 2183018362218727504n,
  "monad-mainnet": 8481857512324358265n,
} as const;

export type Config = {
  /** Cron expression. A five-minute cadence is written as a step of 5 in the minute field. */
  schedule: string;
  chain: keyof typeof CHAIN_SELECTORS;
  /** Modalis contracts on that chain. */
  rebalanceExecutor: Address;
  portfolioMandate: Address;
  assetRegistry: Address;
  riskSignalReceiver: Address;
  /** Portfolios to monitor. */
  owners: Address[];
  gasLimit?: string;
  /**
   * Report encoder/signing/hashing names. These are CRE platform identifiers rather than
   * anything Modalis defines, so they are configuration: check them against the current CRE docs
   * for your target before deploying, and the workflow will fail loudly if they are wrong.
   */
  report?: { encoderName?: string; signingAlgo?: string; hashingAlgo?: string };
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/** One EVM read through the CRE capability. */
function readContract(
  evm: InstanceType<typeof cre.capabilities.EVMClient>,
  runtime: Runtime<Config>,
  to: Address,
  data: Hex,
): Hex {
  const reply = evm
    .callContract(runtime, {
      call: { from: hexToBase64(ZERO_ADDRESS), to: hexToBase64(to), data: hexToBase64(data) },
    })
    .result();
  const raw = (reply as { data?: string | Uint8Array }).data;
  if (raw === undefined) throw new Error(`Empty response reading ${to}`);
  return toHexFlexible(raw);
}

export type OwnerRisk = {
  owner: Address;
  status: RiskStatusCode;
  statusName: "OK" | "DRIFT" | "BREACH";
  mandateVersion: number;
  maxDriftBps: bigint;
  totalValue: bigint;
  reason: string;
};

/**
 * Computes one portfolio's risk state purely from chain reads, so every DON node reaches the
 * same answer. No clocks, no randomness, no off-chain data.
 */
export function riskForOwner(
  evm: InstanceType<typeof cre.capabilities.EVMClient>,
  runtime: Runtime<Config>,
  owner: Address,
): OwnerRisk | null {
  const cfg = runtime.config;

  const mandate = decodeMandate(readContract(evm, runtime, cfg.portfolioMandate, callMandateOf(owner)));
  if (mandate.version === 0 || !mandate.active) return null;

  const allocations = decodeAllocations(
    readContract(evm, runtime, cfg.portfolioMandate, callAllocationsOf(owner)),
  );
  if (allocations.length === 0) return null;

  const state = decodePortfolioState(
    readContract(evm, runtime, cfg.rebalanceExecutor, callPortfolioState(owner)),
  );

  // Asset metadata decides which holdings count toward the liquidity floor.
  const assets = allocations.map((a) =>
    decodeAsset(readContract(evm, runtime, cfg.assetRegistry, callGetAsset(a.token))),
  );

  const rules: MandateRules = {
    maxSingleAssetBps: mandate.maxSingleAssetBps,
    minLiquidityBps: mandate.minLiquidityBps,
    rebalanceThresholdBps: mandate.rebalanceThresholdBps,
    maxSlippageBps: mandate.maxSlippageBps,
    maxDrawdownBps: mandate.maxDrawdownBps,
    targetValue: mandate.targetValue,
    targetDate: mandate.targetDate,
  };
  const engineAllocations: Allocation[] = allocations.map((a, i) => ({
    token: a.token,
    symbol: assets[i].symbol,
    targetBps: a.targetBps,
    minBps: a.minBps,
    maxBps: a.maxBps,
    isLiquid: assets[i].isLiquid,
    assetMaxBps: assets[i].maxBps,
  }));

  // portfolioState returns values in the mandate's allocation order, so indexes line up.
  const risk = assessRisk(rules, engineAllocations, [...state.values]);
  const status: RiskStatusCode = risk.status === "BREACH" ? 2 : risk.status === "DRIFT" ? 1 : 0;

  const reason =
    risk.violations.length > 0
      ? risk.violations
          .map((v) => {
            const symbol = engineAllocations.find((a) => a.token === v.token)?.symbol ?? "liquidity";
            return `${v.code}:${symbol}:${v.bps}/${v.limitBps}`;
          })
          .join(",")
      : `DRIFT:${risk.maxDriftBps}/${rules.rebalanceThresholdBps}`;

  return {
    owner,
    status,
    statusName: risk.status,
    mandateVersion: mandate.version,
    maxDriftBps: BigInt(risk.maxDriftBps),
    totalValue: state.total,
    reason,
  };
}

/** Cron handler: evaluate every watched portfolio and publish each risk state on-chain. */
const onCron = async (runtime: Runtime<Config>): Promise<{ evaluated: number; published: number }> => {
  const cfg = runtime.config;
  const selector = CHAIN_SELECTORS[cfg.chain];
  if (!selector) throw new Error(`Unsupported chain "${cfg.chain}". Use monad-testnet or monad-mainnet.`);

  const evm = new cre.capabilities.EVMClient(selector);
  const reportCfg = {
    encoderName: cfg.report?.encoderName ?? "evm",
    signingAlgo: cfg.report?.signingAlgo ?? "ecdsa",
    hashingAlgo: cfg.report?.hashingAlgo ?? "keccak256",
  };

  let evaluated = 0;
  let published = 0;

  for (const owner of cfg.owners) {
    const risk = riskForOwner(evm, runtime, owner);
    if (!risk) {
      runtime.log(`${owner}: no active mandate, skipping`);
      continue;
    }
    evaluated++;
    runtime.log(
      `${owner}: ${risk.statusName} (drift ${risk.maxDriftBps} bps, value ${risk.totalValue}) — ${risk.reason}`,
    );

    const payload = encodeRiskReport({
      owner: risk.owner,
      status: risk.status,
      mandateVersion: risk.mandateVersion,
      maxDriftBps: risk.maxDriftBps,
      totalValue: risk.totalValue,
      reason: risk.reason,
    });

    // The DON signs the payload; RiskSignalReceiver accepts it only from the CRE forwarder.
    const report = runtime
      .report({ encodedPayload: hexToBase64(payload), ...reportCfg })
      .result();

    evm
      .writeReport(runtime, {
        receiver: hexToBase64(cfg.riskSignalReceiver),
        report,
        ...(cfg.gasLimit ? { gasConfig: { gasLimit: cfg.gasLimit } } : {}),
      })
      .result();

    published++;
    runtime.log(`${owner}: risk state published to ${cfg.riskSignalReceiver}`);
  }

  return { evaluated, published };
};

/** Workflow entry point. The CRE runtime calls this with the deployed config. */
export const initWorkflow = (config: Config) => [
  cre.handler(new cre.capabilities.CronCapability().trigger({ schedule: config.schedule }), onCron),
];

export default initWorkflow;
