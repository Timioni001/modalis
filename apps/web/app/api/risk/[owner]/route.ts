/**
 * GET /api/risk/[owner] — risk state plus, when action is needed, a proposal that has already
 * been simulated against live chain state.
 *
 * Read-only: it signs nothing. The simulation result is what the UI shows before the user or the
 * manager submits anything, so a proposal the mandate would reject is visible as rejected rather
 * than discovered by a failed transaction.
 */
import { getAddress, isAddress } from "viem";
import { evaluate } from "@modalis/risk-monitor/src/monitor.ts";
import { aiConfig, getServerContext } from "@/lib/server";
import { errorResponse, jsonResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string }> },
): Promise<Response> {
  const { owner: raw } = await params;
  if (!isAddress(raw)) return errorResponse("Not a valid address");
  const owner = getAddress(raw);

  try {
    const { client, deployment, deployed, rpc } = await getServerContext();
    if (!deployed) return errorResponse("Modalis is not deployed on this chain yet.", 503);

    const outcome = await evaluate(
      { client, deployment, ai: aiConfig(), rpcUrl: rpc.httpUrl },
      owner,
    );

    if (outcome.kind !== "action_needed") {
      return jsonResponse({ kind: outcome.kind, owner, proposal: null });
    }

    const action = outcome.proposal;
    return jsonResponse({
      kind: outcome.kind,
      owner,
      risk: outcome.risk,
      unplannable: outcome.unplannable ?? null,
      proposal: action
        ? {
            proposal: action.proposal,
            reason: action.reason,
            explanation: action.explanation,
            adapterData: action.adapterData,
            expectedAmountOut: action.expectedAmountOut,
            venue: { name: action.venue.venue.name, reason: action.venue.reason, isDemoVenue: action.venue.isDemoVenue },
            simulation: action.simulation,
          }
        : null,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not assess risk", 500);
  }
}
