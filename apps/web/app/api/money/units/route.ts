import { readAssetBalances } from "@modalis/chain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    return jsonResponse({
      ...(await readAssetBalances(ctx.client, ctx.deployment, owner)),
      checkedAt: new Date().toISOString(),
    });
  });
}
