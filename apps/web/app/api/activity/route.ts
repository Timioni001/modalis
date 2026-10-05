/**
 * GET /api/activity — what has happened.
 *
 * Combines what the chain recorded (everything that succeeded) with what the database recorded
 * (including suggestions the person's rules refused, which emit nothing on-chain because they
 * revert). The response says which halves answered, so the UI never implies a complete history
 * it does not have.
 */
import { getActivity } from "@modalis/domain";
import { activeMandate, findUserByWallet, serverClient } from "@modalis/db";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();

    let planId: string | null = null;
    const db = serverClient();
    if (db) {
      const user = await findUserByWallet(db, owner);
      if (user) planId = (await activeMandate(db, user.id))?.id ?? null;
    }

    return jsonResponse(await getActivity(ctx, owner, { planId }));
  });
}
