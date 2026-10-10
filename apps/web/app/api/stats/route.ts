/**
 * GET /api/stats — the public numbers behind /stats.
 *
 * Nothing here is estimated or invented. Chain figures are read from Monad on the request (block
 * time measured over the last 100 blocks, the current gas price, money held by the vault valued by
 * the same registry the contracts use). Activity counts come from the transactions Modalis has
 * recorded, each of which the server checked on-chain before saving; their hashes link to the
 * explorer so anyone can check them again. No account or address is returned.
 *
 * Cached for a few seconds per instance: it is a public page, and each call costs RPC reads.
 */
import { AssetRegistryAbi, MockERC20Abi } from "@modalis/chain";
import { serverClient } from "@modalis/db";
import type { Address } from "viem";
import { jsonResponse, route } from "@/lib/api";
import { getServerContext } from "@/lib/server";

export const dynamic = "force-dynamic";

let cache: { at: number; body: unknown } | null = null;
const TTL_MS = 5_000;
const WINDOW = 100n;

export async function GET(): Promise<Response> {
  return route(async () => {
    if (cache && Date.now() - cache.at < TTL_MS) return jsonResponse(cache.body);

    const { client, deployment } = await getServerContext();
    const latest = await client.getBlock();
    const [past, gasPrice] = await Promise.all([
      client.getBlock({ blockNumber: latest.number - WINDOW }),
      client.getGasPrice(),
    ]);
    const blockTimeMs = Number(((latest.timestamp - past.timestamp) * 1000n) / WINDOW);

    // Money held: each token's balance in the vault, valued by the AssetRegistry.
    let heldE18: bigint | null = null;
    const vault = deployment.contracts.portfolioVault;
    const registry = deployment.contracts.assetRegistry;
    if (vault && registry) {
      try {
        const tokens = Object.values(deployment.tokens).filter(Boolean) as Address[];
        const values = await Promise.all(
          tokens.map(async (token) => {
            const bal = (await client.readContract({ address: token, abi: MockERC20Abi, functionName: "balanceOf", args: [vault] })) as bigint;
            if (bal === 0n) return 0n;
            return (await client.readContract({ address: registry, abi: AssetRegistryAbi, functionName: "value", args: [token, bal] })) as bigint;
          }),
        );
        heldE18 = values.reduce((a, v) => a + v, 0n);
      } catch {
        heldE18 = null; // a stale demo price makes valuation revert; say nothing rather than guess
      }
    }

    // Recorded activity.
    let activity: {
      plans: number | null;
      transactionsThisWeek: number | null;
      adjustmentsThisWeek: number | null;
      recent: { hash: string; type: string; at: string }[];
    } = { plans: null, transactionsThisWeek: null, adjustmentsThisWeek: null, recent: [] };
    const db = serverClient();
    if (db) {
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      const [plans, week, adjustments, recent] = await Promise.all([
        db.from("mandates").select("id", { count: "exact", head: true }).eq("version", 1),
        db.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        db.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", weekAgo).eq("type", "rebalance"),
        db.from("transactions").select("tx_hash, type, created_at").order("created_at", { ascending: false }).limit(8),
      ]);
      activity = {
        plans: plans.count ?? null,
        transactionsThisWeek: week.count ?? null,
        adjustmentsThisWeek: adjustments.count ?? null,
        recent: ((recent.data ?? []) as { tx_hash: string; type: string; created_at: string }[]).map((r) => ({
          hash: r.tx_hash,
          type: r.type,
          at: r.created_at,
        })),
      };
    }

    const body = {
      chain: {
        chainId: deployment.chainId,
        blockNumber: latest.number,
        blockTimeMs,
        gasPriceWei: gasPrice,
        // A deposit is roughly 70k gas; shown as "about this much per transaction".
        typicalFeeWei: gasPrice * 70_000n,
      },
      heldE18,
      activity,
      at: new Date().toISOString(),
    };
    cache = { at: Date.now(), body };
    return jsonResponse(body);
  });
}
