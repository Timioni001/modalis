/**
 * POST /api/rebalance/invalid — the security demonstration.
 *
 * Builds a well-formed, correctly signed proposal that deliberately violates the user's mandate
 * (concentrating the portfolio into one asset past its cap), submits it for real with an explicit
 * gas limit so it is actually mined rather than rejected during gas estimation, and reports the
 * on-chain revert.
 *
 * This proves the architectural claim rather than asserting it: the AI is not the security
 * boundary, the contract is. The portfolio is read before and after so the UI can show that
 * nothing moved.
 *
 * It is gated on DEMO_MODE and refuses to run on mainnet.
 */
import { getAddress, isAddress } from "viem";
import {
  RebalanceExecutorAbi,
  buildProposal,
  readPortfolio,
  requireContract,
  requireToken,
  simulateProposal,
} from "@modalis/chain";
import { explainRejection } from "@modalis/ai";
import { getManagerWallet, getServerContext, isDemoMode } from "@/lib/server";
import { errorResponse, jsonResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!isDemoMode()) {
    return errorResponse("This endpoint is only available with DEMO_MODE enabled.", 403);
  }

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
    if (deployment.chainId === 143) return errorResponse("Not available on Monad mainnet.", 403);

    const wallet = getManagerWallet(rpc);
    if (!wallet) return errorResponse("No manager key configured on the server.", 503);

    const adapter = deployment.contracts.kuruAdapter ?? deployment.contracts.executionAdapter;
    if (!adapter) return errorResponse("No execution adapter is deployed.", 503);

    const before = await readPortfolio(client, deployment, owner);
    if (!before.hasMandate) return errorResponse("That portfolio has no mandate.", 409);

    // Sell the defensive holding to pile into the growth asset, well past its cap.
    const tokenIn = requireToken(deployment, "mBOND");
    const tokenOut = requireToken(deployment, "mBTC");
    const bond = before.positions.find((p) => p.token.toLowerCase() === tokenIn.toLowerCase());
    if (!bond || bond.amount === 0n) {
      return errorResponse("The portfolio holds no mBOND to build the invalid proposal from.", 409);
    }
    // Most of the defensive sleeve: enough to drive the growth asset far past its limit.
    const amountIn = (bond.amount * 80n) / 100n;

    const built = await buildProposal(client, deployment, {
      owner,
      adapter,
      tokenIn,
      tokenOut,
      amountIn,
      reason:
        "DELIBERATELY INVALID: concentrate the portfolio into one asset, past the mandate's " +
        "single-asset limit. Submitted to demonstrate that the contract refuses it.",
    });

    const simulation = await simulateProposal(
      client,
      deployment,
      built.proposal,
      "0x",
      getAddress(wallet.account!.address),
    );

    // Submit for real with an explicit gas limit, so the revert is an on-chain fact with a hash
    // rather than only a local simulation.
    const hash = await wallet.writeContract({
      address: requireContract(deployment, "rebalanceExecutor"),
      abi: RebalanceExecutorAbi,
      functionName: "execute",
      args: [built.proposal, "0x"],
      account: wallet.account!,
      chain: wallet.chain,
      gas: 2_000_000n,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    const after = await readPortfolio(client, deployment, owner);

    const unchanged = after.positions.every(
      (p) => p.amount === before.positions.find((q) => q.token === p.token)?.amount,
    );

    return jsonResponse({
      submitted: true,
      hash,
      blockNumber: receipt.blockNumber,
      reverted: receipt.status !== "success",
      errorName: simulation.ok ? null : simulation.errorName,
      explanation: simulation.ok
        ? "The contract unexpectedly accepted this proposal."
        : explainRejection(simulation.errorName).body,
      portfolioUnchanged: unchanged,
      proposal: built.proposal,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not run the security test", 500);
  }
}
