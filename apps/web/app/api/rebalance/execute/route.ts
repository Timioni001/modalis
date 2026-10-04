/**
 * POST /api/rebalance/execute — submit the pending rebalance for one portfolio.
 *
 * The proposal is rebuilt here from live chain state rather than accepted from the request body.
 * That is deliberate: a client-supplied proposal would let a caller choose the trade. The only
 * thing the client gets to say is "act on this portfolio now".
 *
 * The manager key signs. It can call RebalanceExecutor.execute and nothing else — it cannot
 * withdraw or change a mandate, which PortfolioMandate enforces on-chain.
 */
import { getAddress, isAddress } from "viem";
import { evaluate, execute } from "@modalis/risk-monitor/src/monitor.ts";
import { explainRejection } from "@modalis/ai";
import { aiConfig, getManagerWallet, getServerContext } from "@/lib/server";
import { errorResponse, jsonResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let owner: `0x${string}`;
  try {
    const body = (await request.json()) as { owner?: string };
    if (!body.owner || !isAddress(body.owner)) throw new Error("A valid `owner` address is required");
    owner = getAddress(body.owner);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Invalid request body");
  }

  try {
    const { client, deployment, deployed, rpc } = await getServerContext();
    if (!deployed) return errorResponse("Modalis is not deployed on this chain yet.", 503);

    const wallet = getManagerWallet(rpc);
    if (!wallet) {
      return errorResponse(
        "No manager key configured on the server. Set MANAGER_PRIVATE_KEY, or submit the " +
          "rebalance from the portfolio owner's own wallet.",
        503,
      );
    }

    const outcome = await evaluate({ client, deployment, ai: aiConfig(), rpcUrl: rpc.httpUrl }, owner);
    if (outcome.kind !== "action_needed" || !outcome.proposal) {
      return jsonResponse(
        { submitted: false, reason: `Nothing to do: portfolio is ${outcome.kind}.` },
        { status: 409 },
      );
    }

    const action = outcome.proposal;
    if (!action.simulation.ok) {
      // The mandate refused it. That is the system working, not a server error.
      return jsonResponse({
        submitted: false,
        rejectedBy: "mandate",
        errorName: action.simulation.errorName,
        explanation: explainRejection(action.simulation.errorName).body,
      });
    }

    const result = await execute(wallet, client, deployment, action);
    return jsonResponse({
      submitted: result.submitted,
      hash: result.hash ?? null,
      blockNumber: result.blockNumber ?? null,
      rejectedWith: result.rejectedWith ?? null,
      skipped: result.skipped ?? null,
      reason: action.reason,
      explanation: action.explanation,
      venue: action.venue.venue.name,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not execute the rebalance", 500);
  }
}
