/**
 * POST /api/money/confirm — record a funding step that settled, and return the updated money.
 *
 * The receipt is CHECKED, not trusted: the transaction is looked up on-chain and must have
 * succeeded and have been sent by the person signing this request. A caller cannot invent a
 * deposit by posting a hash.
 */
import { getMoney } from "@modalis/domain";
import { recordTransaction, serverClient, upsertUser, activeMandate } from "@modalis/db";
import { getAddress, type Hex } from "viem";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const body = (await request.json().catch(() => null)) as { receipt?: string; kind?: string } | null;
    const hash = body?.receipt;

    const ctx = await domainContext();

    if (hash) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return errorResponse("That isn't a valid receipt.");

      // Verify it on-chain before recording anything.
      const receipt = await ctx.client.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
      if (!receipt) return errorResponse("We couldn't find that transaction yet. Try again shortly.", 404);
      if (receipt.status !== "success") {
        return jsonResponse({
          recorded: false,
          reason: "That transaction didn't go through, so nothing was added.",
          money: await getMoney(ctx, owner),
        });
      }
      // The sender must be the person asking, or anyone could claim someone else's deposit.
      if (getAddress(receipt.from) !== getAddress(owner)) {
        return errorResponse("That receipt belongs to a different account.", 403);
      }

      const db = serverClient();
      if (db) {
        const user = await upsertUser(db, { walletAddress: owner, chainId: ctx.deployment.chainId });
        const plan = user ? await activeMandate(db, user.id) : null;
        if (user) {
          await recordTransaction(db, {
            userId: user.id,
            mandateId: plan?.id,
            txHash: hash,
            type: body?.kind === "allow" ? "approve" : "deposit",
            status: "confirmed",
            chainId: ctx.deployment.chainId,
            blockNumber: String(receipt.blockNumber),
          });
        }
      }
    }

    return jsonResponse({ recorded: Boolean(hash), money: await getMoney(ctx, owner) });
  });
}
