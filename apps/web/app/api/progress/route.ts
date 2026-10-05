/**
 * GET /api/progress — am I going to get there?
 *
 * Every forward-looking figure assumes NO investment growth, so the answer is always framed in
 * money the person themselves adds. Modalis does not promise a return.
 */
import { getProgress } from "@modalis/domain";
import { activeMandate, serverClient, findUserByWallet } from "@modalis/db";
import { usdToE18 } from "@modalis/ai";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();

    // The chain holds the target but not what the person said they'd contribute, so that comes
    // from their goal when a database is configured, and is treated as zero when it is not.
    let monthlyE18 = 0n;
    const db = serverClient();
    if (db) {
      const user = await findUserByWallet(db, owner);
      if (user) {
        const { data } = await db
          .from("goals")
          .select("contribution_amount, contribution_cadence")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          const amount = Number(data.contribution_amount);
          const monthly =
            data.contribution_cadence === "weekly"
              ? (amount * 52) / 12
              : data.contribution_cadence === "quarterly"
                ? amount / 3
                : amount;
          monthlyE18 = usdToE18(monthly);
        }
      }
    }

    return jsonResponse({ progress: await getProgress(ctx, owner, monthlyE18) });
  });
}
