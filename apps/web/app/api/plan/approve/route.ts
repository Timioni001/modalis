/**
 * POST /api/plan/approve — record that a plan went live.
 *
 * The person's own wallet already signed `setMandate`; this endpoint does NOT make the plan real,
 * it records what the chain now says. So it reads the live plan back rather than trusting the
 * caller's claim, and stores the goal and interview answers that the chain cannot hold.
 *
 * Calling it is optional. Skipping it loses the goal's name and history, not the plan itself.
 */
import { PortfolioMandateAbi, readPlanState } from "@modalis/chain";
import { decodeFunctionData, type Hex } from "viem";
import { emit, getPlan, parseGoalAnswers } from "@modalis/domain";
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
import {
  domainContext,
  jsonResponse,
  readBody,
  requireOwner,
  rateLimit,
  route,
} from "@/lib/api";
import { errorResponse } from "@/lib/serialize";
import { receiptReference, text } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    await rateLimit(request, "plan:approve", { max: 20, windowMs: 60_000 });
    const raw = await readBody(request);
    // Every field validated: these strings end up in the database and in notifications.
    const body = {
      answers:
        raw.answers === undefined ? undefined : parseGoalAnswers(raw.answers),
      goalName: text(raw.goalName, "a goal name", { max: 80 }),
      reason: text(raw.reason, "a reason", { max: 300 }),
      setTxHash:
        raw.setTxHash === undefined
          ? undefined
          : receiptReference(raw.setTxHash, "the plan receipt"),
    };

    const ctx = await domainContext();

    let approvedAt: string | undefined;
    if (body.setTxHash) {
      const [receipt, transaction] = await Promise.all([
        ctx.client.getTransactionReceipt({ hash: body.setTxHash as Hex }),
        ctx.client.getTransaction({ hash: body.setTxHash as Hex }),
      ]);
      let isPlanAction = false;
      try {
        isPlanAction =
          decodeFunctionData({
            abi: PortfolioMandateAbi,
            data: transaction.input,
          }).functionName === "setMandate";
      } catch {}
      if (
        receipt.status !== "success" ||
        transaction.from.toLowerCase() !== owner.toLowerCase() ||
        transaction.to?.toLowerCase() !==
          ctx.deployment.contracts.portfolioMandate?.toLowerCase() ||
        !isPlanAction
      ) {
        return errorResponse(
          "That receipt does not show a successful plan action from your account.",
          400,
        );
      }
      const block = await ctx.client.getBlock({ blockHash: receipt.blockHash });
      approvedAt = new Date(Number(block.timestamp) * 1000).toISOString();
    }

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

    const user = await upsertUser(db, {
      walletAddress: owner,
      chainId: ctx.deployment.chainId,
    });
    if (!user)
      return jsonResponse(
        {
          plan,
          saved: false,
          note: "Your plan is live, but the goal record is temporarily unavailable. Try again in a moment.",
        },
        { status: 207 },
      );

    // A re-approval is a NEW VERSION of the same plan, so it updates the goal that plan was built
    // for. Creating a fresh goal each time would duplicate it in the goal list and split the
    // portfolio between two copies of the same goal.
    const previous = await activeMandate(db, user.id);
    const preferences = body.answers?.savings ?? plan.goal.savings;
    const fields = {
      type: body.answers?.goalKind ?? plan.goal.kind,
      initialAmount:
        body.answers?.startingAmount ?? Number(plan.goal.startingAmount.amount),
      name: body.goalName ?? plan.goal.name,
      targetValue: Number(plan.goal.target.amount),
      targetDate: plan.goal.targetDate.slice(0, 10),
      contributionAmount:
        body.answers?.contributionAmount ??
        Number(plan.goal.contribution.amount.amount),
      contributionCadence:
        body.answers?.contributionCadence ?? plan.goal.contribution.cadence,
      liquidityNeed: body.answers?.moneyKeptAvailable,
      ...(preferences
        ? {
            savingsPreferences: {
              ...preferences,
              ...(approvedAt ? { startedAt: approvedAt } : {}),
            },
          }
        : {}),
    };
    const goal = previous?.goal_id
      ? ((await updateGoal(db, user.id, previous.goal_id, fields)) ??
        (await createGoal(db, { userId: user.id, ...fields, priority: 1 })))
      : await createGoal(db, {
          userId: user.id,
          ...fields,
          priority: 1,
        });
    if (!goal)
      return jsonResponse(
        {
          plan,
          saved: false,
          note: "Your plan is live, but your goal details could not be saved. Try again.",
        },
        { status: 207 },
      );
    const rules = await readPlanState(ctx.client, ctx.deployment, owner);
    const reason =
      body.reason ??
      (previous
        ? `You changed your plan (version ${plan.version}).`
        : "You approved your first plan.");

    if (body.answers) {
      const saved = await saveInterview(db, {
        userId: user.id,
        goalId: goal?.id,
        answers: {
          ...body.answers,
          ...(fields.savingsPreferences
            ? { savings: fields.savingsPreferences }
            : {}),
        } as unknown as Json,
      });
      if (!saved) {
        // The goal row is already safely stored. Keep the approval successful and let a later
        // retry fill the optional interview history instead of making the person think the goal
        // disappeared.
        console.warn("[modalis] goal saved but interview history was unavailable");
      }
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
      maxSlippageBps: rules.mandate.maxSlippageBps,
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
