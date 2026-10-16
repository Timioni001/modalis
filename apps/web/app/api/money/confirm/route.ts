/**
 * POST /api/money/confirm — record a funding step that settled, and return the updated money.
 *
 * The receipt is CHECKED, not trusted: the transaction is looked up on-chain and must have
 * succeeded and have been sent by the person signing this request. A caller cannot invent a
 * deposit by posting a hash.
 */
import { checkMilestones, emit, getMoney } from "@modalis/domain";
import { count } from "@/lib/observe";
import {
  recordTransaction,
  serverClient,
  upsertUser,
  activeMandate,
} from "@modalis/db";
import { getAddress, type Hex } from "viem";
import {
  domainContext,
  idempotent,
  jsonResponse,
  rateLimit,
  readBody,
  requireOwner,
  route,
} from "@/lib/api";
import { oneOf, receiptReference } from "@/lib/validate";
import { errorResponse } from "@/lib/serialize";
import { receiptAction } from "@/lib/receipt-action";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "money:confirm", { max: 40, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const body = await readBody(request);
    const hash =
      body.receipt === undefined ? undefined : receiptReference(body.receipt);
    const kind =
      body.kind === undefined
        ? undefined
        : oneOf(body.kind, "step", [
            "allow",
            "add",
            "withdraw",
            "pause",
            "resume",
          ] as const);

    // The receipt itself is the natural one-time key: confirming the same transaction twice
    // should record it once and replay the same answer.
    return idempotent(
      owner,
      "money:confirm",
      { requestKey: hash ? `${hash}_${kind ?? "infer"}` : "no-receipt-read" },
      async () => {
        const ctx = await domainContext();

        if (hash) {
          // Verify it on-chain before recording anything.
          const receipt = await ctx.client
            .getTransactionReceipt({ hash: hash as Hex })
            .catch(() => null);
          if (!receipt)
            return errorResponse(
              "We couldn't find that transaction yet. Try again shortly.",
              404,
            );
          if (receipt.status !== "success") {
            count("tx.failed", 1, kind);
            return jsonResponse({
              recorded: false,
              reason:
                "That transaction didn't go through, so nothing was added.",
              money: await getMoney(ctx, owner).catch(() => null),
            });
          }
          // The sender must be the person asking, or anyone could claim someone else's deposit.
          if (getAddress(receipt.from) !== getAddress(owner)) {
            return errorResponse(
              "That receipt belongs to a different account.",
              403,
            );
          }
          const action = receiptAction(
            receipt,
            owner,
            {
              vault: ctx.deployment.contracts.portfolioVault!,
              mandate: ctx.deployment.contracts.portfolioMandate!,
              tokens: Object.values(ctx.deployment.tokens),
            },
            kind,
          );
          if (!action)
            return errorResponse(
              "That receipt does not confirm the requested action in your plan.",
              400,
            );

          const db = serverClient();
          if (db) {
            const user = await upsertUser(db, {
              walletAddress: owner,
              chainId: ctx.deployment.chainId,
            });
            const plan = user ? await activeMandate(db, user.id) : null;
            if (user) {
              await recordTransaction(db, {
                userId: user.id,
                mandateId: plan?.id,
                txHash: hash,
                type:
                  action === "allow"
                    ? "approve"
                    : action === "withdraw"
                      ? "withdraw"
                      : action === "add"
                        ? "deposit"
                        : "other",
                status: "confirmed",
                chainId: ctx.deployment.chainId,
                blockNumber: String(receipt.blockNumber),
              });
              // Permission grants are plumbing; only money actually moving is an event worth keeping.
              if (action !== "allow") {
                const type =
                  action === "withdraw"
                    ? "money_withdrawn"
                    : action === "pause"
                      ? "plan_paused"
                      : action === "resume"
                        ? "plan_resumed"
                        : "money_added";
                await emit(db, {
                  userId: user.id,
                  type,
                  txHash: hash,
                  payload: {},
                });
                if (action === "add" || action === "withdraw")
                  await checkMilestones(ctx, owner).catch(() => undefined);
              }
            }
          }
        }

        const money = await getMoney(ctx, owner).catch(() => null);
        return jsonResponse({
          recorded: Boolean(hash),
          money,
          valuationAvailable: money !== null,
        });
      },
    );
  });
}
