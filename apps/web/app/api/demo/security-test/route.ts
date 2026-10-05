/**
 * POST /api/demo/security-test — prove the rules actually stop Modalis.
 *
 * Builds a well-formed, correctly signed change that deliberately breaks one of the person's own
 * rules, submits it FOR REAL with an explicit gas limit so it is genuinely mined rather than
 * rejected beforehand, and reports the on-chain refusal.
 *
 * This demonstrates the architectural claim instead of asserting it: Modalis recommends, the
 * person's rules decide. The money is read before and after so the UI can show nothing moved.
 *
 * Authenticated and owner-scoped like every other action: it can only ever be run against the
 * signed-in person's own plan. Gated on DEMO_MODE and refused on mainnet.
 */
import {
  RebalanceExecutorAbi,
  buildProposal,
  readPortfolio,
  requireContract,
  requireToken,
  simulateProposal,
} from "@modalis/chain";
import { explainRejection } from "@modalis/ai";
import { moneyFromE18, toReceipt } from "@modalis/domain";
import { getAddress } from "viem";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";
import { getManagerWallet, getServerContext, isDemoMode } from "@/lib/server";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    if (!isDemoMode()) {
      return errorResponse("This is only available on a demo deployment.", 403);
    }
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    if (ctx.deployment.chainId === 143) return errorResponse("Not available on the live network.", 403);

    const { rpc } = await getServerContext();
    const wallet = getManagerWallet(rpc);
    if (!wallet) return errorResponse("No signing key is configured on this deployment.", 503);

    const adapter = ctx.deployment.contracts.kuruAdapter ?? ctx.deployment.contracts.executionAdapter;
    if (!adapter) return errorResponse("No way to trade is configured on this deployment.", 503);

    const before = await readPortfolio(ctx.client, ctx.deployment, owner);
    if (!before.hasMandate) return errorResponse("You don't have a plan yet.", 409);

    // Sell the defensive holding to pile into the growth one, far past the person's own limit.
    const tokenIn = requireToken(ctx.deployment, "mBOND");
    const tokenOut = requireToken(ctx.deployment, "mBTC");
    const source = before.positions.find((p) => p.token.toLowerCase() === tokenIn.toLowerCase());
    if (!source || source.amount === 0n) {
      return errorResponse("There isn't enough in your plan to run this demonstration yet.", 409);
    }

    const built = await buildProposal(ctx.client, ctx.deployment, {
      owner,
      adapter,
      tokenIn,
      tokenOut,
      amountIn: (source.amount * 80n) / 100n,
      reason:
        "DELIBERATELY INVALID: concentrate everything into one investment, past the limit the " +
        "person set. Submitted to demonstrate that their rules refuse it.",
    });

    const simulation = await simulateProposal(
      ctx.client,
      ctx.deployment,
      built.proposal,
      "0x",
      getAddress(wallet.account!.address),
    );

    // Submit with an explicit gas limit so the refusal is an on-chain fact with a receipt,
    // rather than only a local simulation.
    const hash = await wallet.writeContract({
      address: requireContract(ctx.deployment, "rebalanceExecutor"),
      abi: RebalanceExecutorAbi,
      functionName: "execute",
      args: [built.proposal, "0x"],
      account: wallet.account!,
      chain: wallet.chain,
      gas: 2_000_000n,
    });
    const receipt = await ctx.client.waitForTransactionReceipt({ hash });
    const after = await readPortfolio(ctx.client, ctx.deployment, owner);

    const unchanged = after.positions.every(
      (p) => p.amount === before.positions.find((q) => q.token === p.token)?.amount,
    );

    return jsonResponse({
      stoppedByYourRules: receipt.status !== "success",
      explanation: simulation.ok
        ? "Unexpectedly, the rules allowed this. That should not happen."
        : explainRejection(simulation.errorName).body,
      ruleName: simulation.ok ? null : simulation.errorName,
      moneyUnchanged: unchanged,
      moneyBefore: moneyFromE18(before.totalValueE18),
      moneyAfter: moneyFromE18(after.totalValueE18),
      receipt: toReceipt(hash, receipt.status === "success", ctx.explorerUrl, new Date()),
    });
  });
}
