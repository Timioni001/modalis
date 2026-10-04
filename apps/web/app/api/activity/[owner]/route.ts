/**
 * GET /api/activity/[owner] — the portfolio's history.
 *
 * Reads the Envio indexer when one is configured, because reconstructing history from RPC log
 * queries does not scale. Falls back to direct log queries so the app stays functional without
 * the indexer, and says which source answered so the UI never implies indexed data it does not
 * have.
 */
import { getAddress, isAddress } from "viem";
import { fetchActivity } from "@modalis/chain";
import { getServerContext } from "@/lib/server";
import { errorResponse, jsonResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const ENVIO_QUERY = `
query PortfolioActivity($owner: String!) {
  Transaction(where: { owner_id: { _eq: $owner } }, order_by: { blockNumber: desc }, limit: 100) {
    id type token amount txHash blockNumber timestamp
  }
  Rebalance(where: { owner_id: { _eq: $owner } }, order_by: { blockNumber: desc }, limit: 50) {
    id mandateVersion nonce tokenIn tokenOut amountIn amountOut reasonHash
    tokens bpsBefore bpsAfter txHash blockNumber timestamp
  }
  RiskEvent(where: { owner_id: { _eq: $owner } }, order_by: { blockNumber: desc }, limit: 50) {
    id status mandateVersion maxDriftBps totalValue rebalanceRequired txHash blockNumber timestamp
  }
  Mandate(where: { owner_id: { _eq: $owner } }, order_by: { version: desc }) {
    id version targetValue targetDate maxDrawdownBps minLiquidityBps rebalanceThresholdBps
    maxSingleAssetBps maxSlippageBps active createdAtBlock txHash
    allocations { token targetBps minBps maxBps }
  }
}`;

async function fromEnvio(owner: string): Promise<unknown | null> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: ENVIO_QUERY, variables: { owner: owner.toLowerCase() } }),
      // History is append-only; a short cache keeps the activity view snappy.
      next: { revalidate: 5 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: unknown; errors?: unknown[] };
    if (json.errors?.length || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string }> },
): Promise<Response> {
  const { owner: raw } = await params;
  if (!isAddress(raw)) return errorResponse("Not a valid address");
  const owner = getAddress(raw);

  const indexed = await fromEnvio(owner);
  if (indexed) return jsonResponse({ source: "envio", owner, ...indexed });

  try {
    const { client, deployment, deployed } = await getServerContext();
    if (!deployed) return errorResponse("Modalis is not deployed on this chain yet.", 503);

    const items = await fetchActivity(client, deployment, owner);
    return jsonResponse({
      source: "rpc",
      owner,
      note: "Read from RPC logs. Configure ENVIO_GRAPHQL_URL for indexed history.",
      items,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not read activity", 500);
  }
}
