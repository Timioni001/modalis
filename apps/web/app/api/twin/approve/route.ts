import { PortfolioMandateAbi, readPlanState } from "@modalis/chain";
import {
  activeMandate,
  createGoal,
  recordMandate,
  serverClient,
  updateGoal,
  updateScenarioResult,
  upsertUser,
  type Json,
} from "@modalis/db";
import { emit, getPlan } from "@modalis/domain";
import { decodeFunctionData, type Address, type Hex } from "viem";
import { domainContext, jsonResponse, readBody, rateLimit, requireOwner, route } from "@/lib/api";
import { receiptReference, text, uuid } from "@/lib/validate";
import { toJson } from "@/lib/serialize";
import { candidateFromInput, checkTwinReceiptParams, inputFromCandidate, loadTwinSnapshot } from "../_lib";

export const dynamic = "force-dynamic";

type DecodedParams = {
  targetValue: bigint;
  targetDate: bigint;
  maxDrawdownBps: number;
  minLiquidityBps: number;
  rebalanceThresholdBps: number;
  maxSingleAssetBps: number;
  maxSlippageBps: number;
};
type DecodedAllocation = { token: Address; targetBps: number; minBps: number; maxBps: number };

/** Records and verifies an owner-signed Twin plan update. The server never signs the mandate. */
export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    await rateLimit(request, "twin:approve", { max: 10, windowMs: 60_000 });
    const body = await readBody(request);
    const setTxHash = receiptReference(body.setTxHash, "the plan receipt") as Hex;
    const candidate = candidateFromInput(body.alternative);
    const scenarioId = body.scenarioId === undefined ? null : uuid(body.scenarioId, "that saved future");
    const ctx = await domainContext();
    const snapshot = await loadTwinSnapshot(ctx, owner);
    const input = inputFromCandidate(candidate, snapshot.base.startingE18);

    const [receipt, transaction] = await Promise.all([
      ctx.client.getTransactionReceipt({ hash: setTxHash }),
      ctx.client.getTransaction({ hash: setTxHash }),
    ]);
    if (
      receipt.status !== "success" ||
      transaction.from.toLowerCase() !== owner.toLowerCase() ||
      transaction.to?.toLowerCase() !== ctx.deployment.contracts.portfolioMandate?.toLowerCase()
    ) {
      return Response.json({ error: "That receipt does not show a successful plan update from your account." }, { status: 400 });
    }

    let decoded: { functionName: string; args?: readonly unknown[] };
    try {
      decoded = decodeFunctionData({ abi: PortfolioMandateAbi, data: transaction.input }) as typeof decoded;
    } catch {
      return Response.json({ error: "That receipt is not a Modalis plan update." }, { status: 400 });
    }
    if (decoded.functionName !== "setMandate" || !decoded.args || decoded.args.length !== 2) {
      return Response.json({ error: "That receipt is not a Modalis plan update." }, { status: 400 });
    }
    const params = decoded.args[0] as DecodedParams;
    const allocations = decoded.args[1] as readonly DecodedAllocation[];
    checkTwinReceiptParams(snapshot, input, params, allocations);

    const live = await readPlanState(ctx.client, ctx.deployment, owner);
    if (!live.hasMandate || live.mandate.targetValue !== input.targetE18) {
      return Response.json({ error: "The plan update was confirmed, but the new rules are not visible yet. Refresh and try again." }, { status: 409 });
    }
    const block = await ctx.client.getBlock({ blockHash: receipt.blockHash });
    const approvedAt = new Date(Number(block.timestamp) * 1000).toISOString();
    const plan = await getPlan(ctx, owner);
    const db = serverClient();
    if (!db) {
      return jsonResponse({ verified: true, saved: false, txHash: setTxHash, plan, note: "Your future is live on Monad. History is unavailable because no database is configured." });
    }

    const user = await upsertUser(db, { walletAddress: owner, chainId: ctx.deployment.chainId });
    if (!user) return jsonResponse({ verified: true, saved: false, txHash: setTxHash, plan, note: "Your future is live on Monad, but history could not be saved yet." }, { status: 207 });
    const previous = await activeMandate(db, user.id);
    const goalFields = {
      type: plan.goal.kind,
      initialAmount: Number(plan.goal.startingAmount.amount),
      name: plan.goal.name,
      targetValue: Number(plan.goal.target.amount),
      targetDate: plan.goal.targetDate.slice(0, 10),
      contributionAmount: Number(candidate.monthly),
      contributionCadence: "monthly" as const,
      liquidityNeed: plan.goal.savings?.minimumRetrievalDays && plan.goal.savings.minimumRetrievalDays <= 7 ? "significant" as const : "some" as const,
    };
    const goal = previous?.goal_id
      ? (await updateGoal(db, user.id, previous.goal_id, goalFields))
      : await createGoal(db, { userId: user.id, ...goalFields, priority: 1 });
    const reason = text(body.reason, "a reason", { max: 300 }) ?? `You chose a ${candidate.risk} future in Modalis Twin.`;
    await recordMandate(db, {
      userId: user.id,
      goalId: goal?.id ?? previous?.goal_id ?? undefined,
      contractAddress: ctx.deployment.contracts.portfolioMandate!,
      vaultAddress: ctx.deployment.contracts.portfolioVault,
      version: plan.version,
      targetValue: plan.goal.target.amount,
      targetDate: plan.goal.targetDate,
      maxDrawdownBps: live.mandate.maxDrawdownBps,
      minLiquidityBps: live.mandate.minLiquidityBps,
      maxAssetBps: live.mandate.maxSingleAssetBps,
      rebalanceThresholdBps: live.mandate.rebalanceThresholdBps,
      maxSlippageBps: live.mandate.maxSlippageBps,
      managerAddress: ctx.managerAddress,
      setTxHash,
      reason,
      allocations: live.positions.map((p) => ({
        tokenAddress: p.token,
        symbol: p.symbol,
        targetBps: p.targetBps,
        minBps: p.minBps,
        maxBps: p.maxBps,
        isLiquid: p.isLiquid,
      })),
    });
    if (scenarioId) {
      await updateScenarioResult(db, user.id, scenarioId, toJson({ selected: true, selectedAt: approvedAt, setTxHash, candidate }) as Json);
    }
    await emit(db, {
      userId: user.id,
      type: "plan_approved",
      goalId: goal?.id ?? previous?.goal_id,
      txHash: setTxHash,
      payload: { version: plan.version, reason, source: "modalis_twin", scenarioId },
    });
    return jsonResponse({ verified: true, saved: Boolean(goal), txHash: setTxHash, plan, goalId: goal?.id ?? previous?.goal_id ?? null });
  });
}
