/**
 * POST /api/plan/approve — record that a plan went live.
 *
 * The person's own wallet already signed `setMandate`; this endpoint does NOT make the plan real,
 * it records what the chain now says. So it reads the live plan back rather than trusting the
 * caller's claim, and stores the goal and interview answers that the chain cannot hold.
 *
 * Calling it is optional. Skipping it loses the goal's name and history, not the plan itself.
 */
import { getPlan } from "@modalis/domain";
import { serverClient, upsertUser, createGoal, saveInterview, recordMandate, type Json } from "@modalis/db";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const body = (await request.json().catch(() => ({}))) as {
      answers?: Json;
      goalName?: string;
      setTxHash?: string;
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

    const goal = await createGoal(db, {
      userId: user.id,
      type: plan.goal.kind,
      name: body.goalName ?? plan.goal.name,
      targetValue: Number(plan.goal.target.amount),
      targetDate: plan.goal.targetDate.slice(0, 10),
      initialAmount: Number(plan.goal.startingAmount.amount),
      contributionAmount: Number(plan.goal.contribution.amount.amount),
      contributionCadence: plan.goal.contribution.cadence,
    });

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
      allocations: plan.howMoneyIsSpread.map((h) => ({
        tokenAddress: h.id,
        symbol: h.code,
        targetBps: Math.round(h.sharePercent * 100),
        minBps: Math.round(h.allowedRange.minPercent * 100),
        maxBps: Math.round(h.allowedRange.maxPercent * 100),
        isLiquid: h.isAvailableCash,
      })),
    });

    return jsonResponse({ plan, saved: true, goalId: goal?.id ?? null });
  });
}
