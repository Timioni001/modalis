import { recoverPrices } from "@/lib/demo-prices";
import { getServerContext } from "@/lib/server";
import { jsonResponse, requireOwner, rateLimit, route } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return route(async () => {
    await requireOwner(request);
    await rateLimit(request, "demo:prices", { max: 6, windowMs: 60_000 });
    const receipts = await recoverPrices(await getServerContext());
    return jsonResponse({ refreshed: true, simulated: true, receipts });
  });
}
