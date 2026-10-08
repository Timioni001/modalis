/**
 * POST /api/plan/approve — record that a plan went live.
 *
 * The person's own wallet already signed `setMandate`; this endpoint does NOT make the plan real,
 * it records what the chain now says. So it reads the live plan back rather than trusting the
 * caller's claim, and stores the goal and interview answers that the chain cannot hold.
 *
 * Calling it is optional. Skipping it loses the goal's name and history, not the plan itself.
 */
import { emit, getPlan } from "@modalis/domain";
import {
  activeMandate,
  createGoal,
  recordMandate,
  saveInterview,
  serverClient,
  updateGoal,
  upsertUser,
  type Json,
} from "@modalis/db";
import { domainContext, jsonResponse, readBody, requireOwner, route } from "@/lib/api";
import { errorResponse } from "@/lib/serialize";
import { receiptReference, text } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const raw = await readBody(request);
    // Every field validated: these strings end up in the database and in notifications.
    const body = {
      answers: raw.answers as Json | undefined,
      goalName: text(raw.goalName, "a goal name", { max: 80 }),
      reason: text(raw.reason, "a reason", { max: 300 }),
      setTxHash: raw.setTxHash === undefined ? undefined : receiptReference(raw.setTxHash, "the plan receipt"),
    };

    const ctx = await domainContext();

    // Read the chain rather than believe the caller. If they did not actually sign, this throws.
    const plan = await getPlan(ctx, owner);

    const db = serverClient();
    if (!db) {
      return jsonResponse({
        plan,
        saved: false,
        note: "Your plan is live. Goal history isn't being saved because no database is configured.",
      });
    }

    const user = await upsertUser(db, { walletAddress: owner, chainId: ctx.deployment.chainId });
    if (!user) return errorResponse("Your plan is live, but we couldn't save your goal.", 207);

    // A re-approval is a NEW VERSION of the same plan, so it updates the goal that plan was built
    // for. Creating a fresh goal each time would duplicate it in the goal list and split the
    // portfolio between two copies of the same goal.
    const previous = await activeMandate(db, user.id);
    const fields = {
      name: body.goalName ?? plan.goal.name,
      targetValue: Number(plan.goal.target.amount),
      targetDate: plan.goal.targetDate.slice(0, 10),
      contributionAmount: Number(plan.goal.contribution.amount.amount),
      contributionCadence: plan.goal.contribution.cadence,
    };
    const goal = previous?.goal_id
      ? ((await updateGoal(db, user.id, previous.goal_id, fields)) ??
        (await createGoal(db, { userId: user.id, type: plan.goal.kind, initialAmount: Number(plan.goal.startingAmount.amount), ...fields, priority: 1 })))
      : await createGoal(db, {
          userId: user.id,
          type: plan.goal.kind,
          initialAmount: Number(plan.goal.startingAmount.amount),
          ...fields,
          priority: 1,
        });
    const reason =
      body.reason ?? (previous ? `You changed your plan (version ${plan.version}).` : "You approved your first plan.");

    if (body.answers) {
      await saveInterview(db, { userId: user.id, goalId: goal?.id, answers: body.answers });
    }

    await recordMandate(db, {
      userId: user.id,
      goalId: goal?.id,
      contractAddress: ctx.deployment.contracts.portfolioMandate!,
      vaultAddress: ctx.deployment.contracts.portfolioVault,
      version: plan.version,
      targetValue: plan.goal.target.amount,
      targetDate: plan.goal.targetDate,
      maxDrawdownBps: plan.rules.comfortableLosingPercent * 100,
      minLiquidityBps: plan.rules.moneyKeptAvailablePercent * 100,
      maxAssetBps: plan.rules.maxInOneInvestmentPercent * 100,
      rebalanceThresholdBps: plan.rules.adjustWhenOffTargetByPercent * 100,
      maxSlippageBps: 200,
      managerAddress: ctx.managerAddress,
      setTxHash: body.setTxHash,
      reason,
      allocations: plan.howMoneyIsSpread.map((h) => ({
        tokenAddress: h.id,
        symbol: h.code,
        targetBps: Math.round(h.sharePercent * 100),
        minBps: Math.round(h.allowedRange.minPercent * 100),
        maxBps: Math.round(h.allowedRange.maxPercent * 100),
        isLiquid: h.isAvailableCash,
      })),
    });

    await emit(db, {
      userId: user.id,
      type: "plan_approved",
      goalId: goal?.id,
      txHash: body.setTxHash,
      payload: { version: plan.version, reason },
    });

    return jsonResponse({ plan, saved: true, goalId: goal?.id ?? null });
  });
}
