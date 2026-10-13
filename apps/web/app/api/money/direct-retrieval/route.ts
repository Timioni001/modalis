import { prepareDirectRetrieval } from "@modalis/domain";
import {
  domainContext,
  jsonResponse,
  rateLimit,
  readBody,
  requireOwner,
  route,
} from "@/lib/api";
import { money } from "@/lib/validate";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return route(async () => {
    const owner = await requireOwner(request);
    await rateLimit(request, "money:direct-retrieval", {
      max: 20,
      windowMs: 60_000,
    });
    const body = await readBody(request);
    return jsonResponse(
      await prepareDirectRetrieval(
        await domainContext(),
        owner,
        money(body.amount, "a demo-token amount"),
      ),
    );
  });
}
