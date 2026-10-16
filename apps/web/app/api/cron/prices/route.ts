import { timingSafeEqual } from "node:crypto";
import { recoverPrices } from "@/lib/demo-prices";
import { getServerContext } from "@/lib/server";
import { jsonResponse, route } from "@/lib/api";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  const received = Buffer.from(supplied);
  const wanted = Buffer.from(expected);
  if (
    !secret ||
    received.length !== wanted.length ||
    !timingSafeEqual(received, wanted)
  )
    return Response.json({ error: "Not authorized." }, { status: 401 });
  return route(async () =>
    jsonResponse({
      refreshed: true,
      receipts: await recoverPrices(await getServerContext()),
    }),
  );
}
