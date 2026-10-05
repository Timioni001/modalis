#!/usr/bin/env node
/**
 * MODALIS — the complete financial loop, executed against a real EVM chain.
 *
 *   GOAL -> PROFILE -> MANDATE -> ONCHAIN MANDATE -> DEPOSIT -> MONITOR -> BREACH
 *        -> PROPOSAL -> MANDATE VALIDATION -> EXECUTION -> SETTLEMENT -> UPDATED STATE
 *
 * It also runs the deliberate invalid proposal and proves the contract rejects it on-chain.
 *
 * Every transaction here is a real transaction signed by a real key and mined by a real node, and
 * every hash printed came back from that node. The ONLY synthetic input is the demo oracle price
 * move in step 6, which is what a "controlled scenario" means; everything downstream of it —
 * the breach, the proposal, the validation, the settlement — is genuine.
 *
 * Usage (local):
 *   anvil --chain-id 10143 &
 *   DEPLOYER_PRIVATE_KEY=0xac09... forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url http://127.0.0.1:8545 --broadcast
 *   MODALIS_RPC_URL=http://127.0.0.1:8545 pnpm --filter @modalis/demo loop
 *
 * Against Monad testnet, point MODALIS_RPC_URL at the testnet RPC and supply funded keys.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  approveToken,
  createMonadPublicClient,
  createManagerWalletClient,
  hasMulticall3,
  deployedIntegrations,
  deploymentFromJson,
  deposit,
  formatUsd,
  readPortfolio,
  requireContract,
  requireToken,
  setMandate,
  setManager,
  simulateProposal,
  buildProposal,
  usdToTokenAmount,
  MockERC20Abi,
  RebalanceExecutorAbi,
  type Deployment,
  type Proposal,
} from "@modalis/chain";
import { buildMandateDraft, explainMandate, usdToE18, type InterviewAnswers, type UniverseAsset } from "@modalis/ai";
import { evaluate, execute, toEngineInputs } from "@modalis/risk-monitor";
import { btcRallyScenario, resetScenario, runScenario } from "@modalis/risk-monitor";
import { assessRisk } from "@modalis/portfolio";
import { getAddress, parseEther, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Report } from "./report.ts";

// ---------------------------------------------------------------- environment

const RPC_URL = process.env.MODALIS_RPC_URL ?? "http://127.0.0.1:8545";
const EXPLORER = process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL;

/**
 * Local anvil's deterministic accounts. Used ONLY when no key is supplied, i.e. for a local run.
 * These are the well-known public test keys; they hold nothing anywhere real.
 */
const ANVIL = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  user: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  manager: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
} as const;

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? ANVIL.deployer;
const MANAGER_KEY = process.env.MANAGER_PRIVATE_KEY ?? ANVIL.manager;

/**
 * The demo user. A FRESH key is generated per run unless one is supplied, so the run is
 * idempotent: Modalis allows one portfolio per owner address, and reusing an address would stack
 * this run's deposits on the last run's positions and distort every allocation that follows.
 * The deployer funds the new address with gas.
 */
const USER_KEY = process.env.DEMO_USER_PRIVATE_KEY ?? generatePrivateKey();
const USER_IS_FRESH = !process.env.DEMO_USER_PRIVATE_KEY;

/** The brief's demo user: $20,000 for a house in five years. */
const INTERVIEW: InterviewAnswers = {
  goalType: "house",
  goalDescription: "I want to save $20,000 for a house",
  targetValue: 20_000,
  initialAmount: 10_000,
  contributionAmount: 200,
  contributionCadence: "monthly",
  horizonMonths: 60,
  drawdownResponse: "do_nothing",
  maxTolerableDrawdownPct: 15,
  liquidityNeed: "some",
  incomeStability: "stable",
};

/**
 * The initial deposit, in USD. It is split across assets according to the MANDATE's own target
 * weights rather than a fixed split, so the portfolio starts at target — which is what the
 * product actually does, and what makes a later breach attributable to the market rather than to
 * a mis-funded portfolio.
 */
const INITIAL_DEPOSIT_USD = 10_000;

function loadDeployment(chainId: number): Deployment {
  const path = resolve(import.meta.dirname, "../../../contracts/deployments", `${chainId}.json`);
  try {
    return deploymentFromJson(JSON.parse(readFileSync(path, "utf8")));
  } catch (err) {
    throw new Error(
      `Could not read ${path}. Deploy first:\n` +
        `  DEPLOYER_PRIVATE_KEY=<key> forge script script/Deploy.s.sol:Deploy --rpc-url ${RPC_URL} --broadcast\n` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

function universeFrom(d: Deployment): UniverseAsset[] {
  return [
    { token: requireToken(d, "mBTC"), symbol: "mBTC", decimals: 8, assetClass: "growth", isLiquid: false, assetMaxBps: 5000, classWeight: 6 },
    { token: requireToken(d, "mETH"), symbol: "mETH", decimals: 18, assetClass: "growth", isLiquid: false, assetMaxBps: 5000, classWeight: 4 },
    { token: requireToken(d, "mBOND"), symbol: "mBOND", decimals: 18, assetClass: "defensive", isLiquid: false, assetMaxBps: 5000 },
    { token: requireToken(d, "mUSD"), symbol: "mUSD", decimals: 6, assetClass: "liquid", isLiquid: true, assetMaxBps: 10000 },
  ];
}

async function waitOk(client: PublicClient, hash: Hex, what: string): Promise<bigint> {
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${what} reverted (${hash})`);
  return r.blockNumber;
}

/**
 * Sends a transaction we EXPECT to revert, with an explicit gas limit so it is actually mined
 * rather than rejected during gas estimation. That turns the rejection into a real, verifiable
 * on-chain event with a real hash — which is the point of the security demonstration.
 */
async function sendExpectingRevert(
  wallet: WalletClient,
  client: PublicClient,
  deployment: Deployment,
  proposal: Proposal,
  adapterData: Hex,
): Promise<{ hash: Hex; blockNumber: bigint; reverted: boolean }> {
  const hash = await wallet.writeContract({
    address: requireContract(deployment, "rebalanceExecutor"),
    abi: RebalanceExecutorAbi,
    functionName: "execute",
    args: [proposal, adapterData],
    account: wallet.account!,
    chain: wallet.chain,
    gas: 2_000_000n,
  });
  const r = await client.waitForTransactionReceipt({ hash });
  return { hash, blockNumber: r.blockNumber, reverted: r.status !== "success" };
}

// --------------------------------------------------------------------- main

async function main(): Promise<void> {
  const chainId = await probeChainId();
  // Monad has Multicall3 on both networks, so batched reads are the right default. A bare local
  // node may not, and batching against a missing Multicall3 returns empty data rather than a
  // useful error, so probe for it instead of assuming.
  const probe = createMonadPublicClient({ chainId, httpUrl: RPC_URL, multicall: false });
  const multicall = await hasMulticall3(probe);
  const rpc = { chainId, httpUrl: RPC_URL, multicall };
  const client = createMonadPublicClient(rpc);

  const deployment = loadDeployment(chainId);
  const report = new Report(chainId, EXPLORER);
  const deployerWallet = createManagerWalletClient(rpc, DEPLOYER_KEY);
  const userWallet = createManagerWalletClient(rpc, USER_KEY);
  const managerWallet = createManagerWalletClient(rpc, MANAGER_KEY);

  const user = getAddress(userWallet.account!.address);
  const manager = getAddress(managerWallet.account!.address);
  const universe = universeFrom(deployment);
  const integrations = deployedIntegrations(deployment);

  console.log(`\nMODALIS end-to-end loop`);
  console.log(`chain        ${chainId}`);
  console.log(`rpc          ${RPC_URL}`);
  console.log(`multicall3   ${multicall ? "present (reads batched)" : "absent (reads unbatched)"}`);
  console.log(`user         ${user}`);
  console.log(`manager      ${manager}`);
  console.log(`venue        ${integrations.kuru ? "KuruAdapter" : "MockExecutionAdapter (demo, oracle-priced)"}`);
  console.log(`CRE receiver ${integrations.cre ? "deployed" : "not deployed"}`);

  // ------------------------------------------------- 0. fund the fresh demo user with gas
  if (USER_IS_FRESH) {
    const gasHash = await deployerWallet.sendTransaction({
      to: user,
      value: parseEther("1"),
      account: deployerWallet.account!,
      chain: deployerWallet.chain,
    });
    await waitOk(client, gasHash, "fund demo user");
  }

  // ------------------------------------------------- 1. demo prices at a known baseline
  // Done BEFORE funding so the deposit is sized at the demo's opening prices. Resetting after
  // funding would revalue the portfolio the moment it was created.
  const resetResult = await runScenario(
    deployerWallet,
    client,
    deployment,
    resetScenario({
      mBTC: requireToken(deployment, "mBTC"),
      mETH: requireToken(deployment, "mETH"),
      mBOND: requireToken(deployment, "mBOND"),
      mUSD: requireToken(deployment, "mUSD"),
    }),
  );
  report.add({
    step: 1,
    title: "Demo oracle set to its opening prices",
    status: "ok",
    detail:
      "mBTC $50,000, mETH $2,500, mBOND $100, mUSD $1. Demo oracle only — a real deployment " +
      "registers a real oracle through AssetRegistry.",
    txs: resetResult.writes.map((w) => ({ label: `price ${w.symbol}`, hash: w.hash, blockNumber: w.blockNumber })),
  });

  // ------------------------------------------------- 2. goal -> mandate draft
  const draft = buildMandateDraft(INTERVIEW, universe, { now: new Date() });
  report.add({
    step: 2,
    title: "Goal interview produces a portfolio mandate",
    status: "ok",
    detail: explainMandate(draft).body,
    facts: [
      `risk tolerance ${draft.profile.riskTolerance}/100, capacity ${draft.profile.riskCapacity}/100, using ${draft.profile.riskScore}/100`,
      `max single asset ${draft.params.maxSingleAssetBps} bps, liquidity floor ${draft.params.minLiquidityBps} bps, rebalance threshold ${draft.params.rebalanceThresholdBps} bps`,
      `plan: ${draft.allocations.map((a) => `${a.symbol} ${a.targetBps / 100}%`).join(", ")}`,
    ],
  });

  // ------------------------------------------------- 3. mandate on-chain
  const setHash = await setMandate(
    userWallet,
    deployment,
    draft.params,
    draft.allocations.map((a) => ({ token: a.token as Address, targetBps: a.targetBps, minBps: a.minBps, maxBps: a.maxBps })),
  );
  const setBlock = await waitOk(client, setHash, "setMandate");
  const managerHash = await setManager(userWallet, deployment, manager);
  const managerBlock = await waitOk(client, managerHash, "setManager");

  const afterMandate = await readPortfolio(client, deployment, user);
  report.add({
    step: 3,
    title: "User approves the mandate; it is stored on Monad",
    status: afterMandate.mandate.version >= 1 ? "ok" : "failed",
    detail: `Mandate v${afterMandate.mandate.version} is live. The user authorised the manager to submit proposals — and nothing else.`,
    facts: ["the manager key cannot withdraw funds or change the mandate; both are owner-only on-chain"],
    txs: [
      { label: "setMandate", hash: setHash, blockNumber: setBlock },
      { label: "setManager", hash: managerHash, blockNumber: managerBlock },
    ],
  });

  // ------------------------------------------------- 4. fund the portfolio
  // Each asset gets its mandate target share of the deposit, converted to token units at the
  // registry's oracle price, so the portfolio opens exactly on target.
  const fundTxs: { label: string; hash: Hex; blockNumber: bigint }[] = [];
  for (const alloc of draft.allocations) {
    const token = alloc.token as Address;
    const asset = universe.find((u) => u.token === token)!;
    const usdShareE18 = (usdToE18(INITIAL_DEPOSIT_USD) * BigInt(alloc.targetBps)) / 10_000n;
    const amount = await usdToTokenAmount(client, deployment, token, usdShareE18, asset.decimals);
    if (amount === 0n) throw new Error(`Deposit for ${alloc.symbol} rounds to zero token units`);

    // Demo tokens have an open mint; on a real deployment the user already holds the asset.
    const mintHash = await deployerWallet.writeContract({
      address: token,
      abi: MockERC20Abi,
      functionName: "mint",
      args: [user, amount],
      account: deployerWallet.account!,
      chain: deployerWallet.chain,
    });
    await waitOk(client, mintHash, `mint ${alloc.symbol}`);

    const approveHash = await approveToken(userWallet, deployment, token, amount);
    await waitOk(client, approveHash, `approve ${alloc.symbol}`);
    const depositHash = await deposit(userWallet, deployment, token, amount);
    const b = await waitOk(client, depositHash, `deposit ${alloc.symbol}`);
    fundTxs.push({ label: `deposit ${alloc.symbol}`, hash: depositHash, blockNumber: b });
  }

  const funded = await readPortfolio(client, deployment, user);
  report.add({
    step: 4,
    title: "Capital is deployed; positions exist on Monad",
    status: funded.totalValueE18 > 0n ? "ok" : "failed",
    detail: `Portfolio value $${formatUsd(funded.totalValueE18)} across ${funded.positions.length} real on-chain positions.`,
    facts: funded.positions.map(
      (p) => `${p.symbol}: ${p.allocationBps / 100}% ($${formatUsd(p.valueE18)}), target ${p.targetBps / 100}%`,
    ),
    txs: fundTxs,
  });

  // ------------------------------------------------- 5. monitor reads real state
  const baseline = await evaluate({ client, deployment, rpcUrl: RPC_URL }, user);
  report.add({
    step: 5,
    title: "Risk monitor reads the live portfolio and finds it compliant",
    status: baseline.kind === "within_mandate" ? "ok" : "failed",
    detail:
      baseline.kind === "within_mandate"
        ? `Within mandate: largest holding ${baseline.risk.largestPositionBps / 100}%, liquidity ${baseline.risk.liquidityBps / 100}%, max drift ${baseline.risk.maxDriftBps / 100}%.`
        : `Expected a compliant portfolio, got "${baseline.kind}".`,
  });

  // ------------------------------------------------- 6. controlled market move
  const rally = await runScenario(
    deployerWallet,
    client,
    deployment,
    btcRallyScenario({ mBTC: requireToken(deployment, "mBTC") }),
  );
  const breached = await readPortfolio(client, deployment, user);
  const breachedInputs = toEngineInputs(breached);
  const breachedRisk = assessRisk(breachedInputs.rules, breachedInputs.allocations, breachedInputs.values);
  report.add({
    step: 6,
    title: "A controlled market movement pushes the portfolio out of its mandate",
    status: breachedRisk.status === "BREACH" ? "ok" : "failed",
    detail:
      "SIMULATED price move (mBTC $50,000 -> $70,000) written to the demo oracle. " +
      `Resulting state computed from real on-chain balances: ${breachedRisk.status}.`,
    facts: [
      ...breached.positions.map((p) => `${p.symbol}: ${p.allocationBps / 100}% (target ${p.targetBps / 100}%)`),
      ...breachedRisk.violations.map((v) => `${v.code}: ${v.bps / 100}% against a ${v.limitBps / 100}% limit`),
    ],
    txs: rally.writes.map((w) => ({ label: `price ${w.symbol}`, hash: w.hash, blockNumber: w.blockNumber })),
  });

  // ------------------------------------------------- 7. detection + proposal
  const breachOutcome = await evaluate({ client, deployment, rpcUrl: RPC_URL }, user);
  if (breachOutcome.kind !== "action_needed" || !breachOutcome.proposal) {
    report.add({
      step: 7,
      title: "Modalis detects the breach and proposes a rebalance",
      status: "failed",
      detail: `Expected an actionable proposal, got "${breachOutcome.kind}"${breachOutcome.kind === "action_needed" ? `: ${breachOutcome.unplannable}` : ""}.`,
    });
    console.log(report.summary());
    process.exit(1);
  }
  const action = breachOutcome.proposal;
  report.add({
    step: 7,
    title: "Modalis detects the breach and proposes a rebalance",
    status: action.simulation.ok ? "ok" : "failed",
    detail: action.explanation,
    facts: [
      `sell ${action.proposal.amountIn} units of ${shortSym(breached, action.proposal.tokenIn)} for at least ${action.proposal.minAmountOut} units of ${shortSym(breached, action.proposal.tokenOut)}`,
      `mandate version ${action.proposal.mandateVersion}, nonce ${action.proposal.nonce}, venue ${action.venue.venue.name}`,
      action.simulation.ok
        ? `simulated against live state: would receive ${action.simulation.amountOut}`
        : `simulation failed: ${action.simulation.errorName}`,
    ],
  });

  // ------------------------------------------------- 8. THE SECURITY TEST
  // A deliberately invalid proposal: buy mBTC with mBOND until BTC is far past its cap.
  // The AI is not the security boundary — this is.
  const invalid = await buildProposal(client, deployment, {
    owner: user,
    adapter: action.proposal.adapter,
    tokenIn: requireToken(deployment, "mBOND"),
    tokenOut: requireToken(deployment, "mBTC"),
    // ~$1,800 of mBOND, which would take mBTC to roughly 55% against a 40% cap.
    amountIn: 18_000_000_000_000_000_000n,
    reason: "DELIBERATELY INVALID: concentrate the portfolio into mBTC, past the mandate's cap.",
  });

  const invalidSim = await simulateProposal(client, deployment, invalid.proposal, action.adapterData, manager);
  const invalidSend = await sendExpectingRevert(managerWallet, client, deployment, invalid.proposal, action.adapterData);
  const stateAfterInvalid = await readPortfolio(client, deployment, user);
  const untouched =
    stateAfterInvalid.positions.every(
      (p) => p.amount === breached.positions.find((q) => q.token === p.token)?.amount,
    ) && invalidSend.reverted;

  report.add({
    step: 8,
    title: "A deliberately invalid proposal is rejected by the contract",
    status: !invalidSim.ok && invalidSend.reverted && untouched ? "rejected_as_expected" : "failed",
    detail:
      !invalidSim.ok
        ? `The mandate refused the action with ${invalidSim.errorName}. The transaction was submitted anyway and reverted on-chain, so the rejection is verifiable.`
        : "Expected the contract to reject this proposal, but the simulation succeeded.",
    facts: [
      !invalidSim.ok ? `revert reason: ${invalidSim.errorName}` : "no revert",
      `portfolio unchanged after the attempt: ${untouched ? "yes" : "NO"}`,
      "the proposal was well-formed and correctly signed; only the mandate stopped it",
    ],
    txs: [{ label: "invalid rebalance", hash: invalidSend.hash, blockNumber: invalidSend.blockNumber, reverted: invalidSend.reverted }],
  });

  // ------------------------------------------------- 9. valid rebalance executes
  // Rebuilt after the failed attempt so the nonce and prices are read fresh from chain.
  const retry = await evaluate({ client, deployment, rpcUrl: RPC_URL }, user);
  if (retry.kind !== "action_needed" || !retry.proposal?.simulation.ok) {
    report.add({
      step: 9,
      title: "The valid rebalance executes and settles on Monad",
      status: "failed",
      detail: `Expected a valid proposal after the rejected one, got "${retry.kind}".`,
    });
    console.log(report.summary());
    process.exit(1);
  }

  const result = await execute(managerWallet, client, deployment, retry.proposal);
  report.add({
    step: 9,
    title: "The valid rebalance executes and settles on Monad",
    status: result.submitted && result.hash && !result.rejectedWith ? "ok" : "failed",
    detail: result.rejectedWith
      ? `Execution did not settle: ${result.rejectedWith}`
      : `Settled through ${retry.proposal.venue.venue.name}. The vault re-measured its own balances and the mandate re-validated the result before the transaction was allowed to succeed.`,
    txs: result.hash ? [{ label: "rebalance", hash: result.hash, blockNumber: result.blockNumber }] : [],
  });

  // ------------------------------------------------- 10. updated state
  const final = await readPortfolio(client, deployment, user);
  const finalInputs = toEngineInputs(final);
  const finalRisk = assessRisk(finalInputs.rules, finalInputs.allocations, finalInputs.values);
  report.add({
    step: 10,
    title: "Updated portfolio state is back inside the mandate",
    status: finalRisk.status === "OK" || finalRisk.violations.length === 0 ? "ok" : "failed",
    detail: `Portfolio value $${formatUsd(final.totalValueE18)}, risk state ${finalRisk.status}, read straight from Monad at block ${final.blockNumber}.`,
    facts: final.positions.map(
      (p) => `${p.symbol}: ${p.allocationBps / 100}% (was ${breached.positions.find((q) => q.token === p.token)!.allocationBps / 100}%, target ${p.targetBps / 100}%)`,
    ),
  });

  // ------------------------------------------------- 11. owner keeps control
  const withdrawTest = await client.simulateContract({
    address: requireContract(deployment, "portfolioVault"),
    abi: (await import("@modalis/chain")).PortfolioVaultAbi,
    functionName: "withdraw",
    args: [requireToken(deployment, "mUSD"), 1_000_000n],
    account: manager,
  }).then(() => false).catch(() => true);

  report.add({
    step: 11,
    title: "The manager cannot withdraw; only the owner can",
    status: withdrawTest ? "ok" : "failed",
    detail: withdrawTest
      ? "A withdrawal attempted with the manager key fails: the vault keys withdrawals off msg.sender, so the manager has no balance to take."
      : "The manager key was able to withdraw. This is a critical failure.",
  });

  console.log(report.summary());

  const out = resolve(import.meta.dirname, "../../../docs/e2e-run.md");
  writeFileSync(out, report.markdown());
  console.log(`\nwrote ${out}`);

  process.exit(report.failed ? 1 : 0);
}

function shortSym(state: { positions: { token: Address; symbol: string }[] }, token: Address): string {
  return state.positions.find((p) => p.token.toLowerCase() === token.toLowerCase())?.symbol ?? token;
}

/** Reads the chain id straight from the node, so nothing is assumed about the target. */
async function probeChainId(): Promise<number> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  });
  const json = (await res.json()) as { result?: string };
  if (!json.result) throw new Error(`No chain id from ${RPC_URL}`);
  return Number(BigInt(json.result));
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
