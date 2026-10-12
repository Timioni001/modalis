/**
 * /api/faucet — test money and network fees for a new person, on testnet only.
 *
 * GET  says what the signed-in wallet has (MON for fees, demo dollars) and whether Modalis will
 *      pay for test money itself on this deployment.
 * POST has Modalis's faucet key mint the demo tokens to the signed-in wallet, and top up a little
 *      MON when the wallet has essentially none. Only when FAUCET_PRIVATE_KEY is set.
 *
 * Bounded by the chain rather than by a shared counter: a wallet that already holds test money and
 * enough MON is refused, so calling it in a loop gets nothing. The in-memory rate limit on top only
 * stops waste on one instance. The recipient is always the verified session's wallet, never an
 * address from the request.
 */
import {
  DEFAULT_MON_FAUCET_URL,
  GAS_TOP_UP_WEI,
  HAS_TEST_MONEY_UNITS,
  createManagerWalletClient,
  hasLowGas,
  isTestnetFaucetChain,
  readTokenBalance,
  testMoneyCalls,
  MULTICALL3_ADDRESS,
  multicall3Abi,
} from "@modalis/chain";
import type { Address, Hex } from "viem";
import { jsonResponse, rateLimit, requireOwner, route } from "@/lib/api";
import { getServerContext } from "@/lib/server";
import { errorResponse } from "@/lib/serialize";
import { count, log } from "@/lib/observe";

export const dynamic = "force-dynamic";

function faucetUrl(): string {
  return process.env.NEXT_PUBLIC_MON_FAUCET_URL?.trim() || DEFAULT_MON_FAUCET_URL;
}

async function walletState(owner: Address) {
  const { client, deployment } = await getServerContext();
  const testnet = isTestnetFaucetChain(deployment.chainId);
  const [gasWei, musd] = await Promise.all([
    client.getBalance({ address: owner }),
    deployment.tokens.mUSD
      ? readTokenBalance(client, deployment.tokens.mUSD, owner).catch(() => 0n)
      : Promise.resolve(0n),
  ]);
  return {
    client,
    deployment,
    testnet,
    gasWei,
    lowGas: hasLowGas(gasWei),
    hasTestMoney: musd >= HAS_TEST_MONEY_UNITS,
  };
}

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const s = await walletState(owner);
    return jsonResponse({
      testnet: s.testnet,
      gasWei: s.gasWei,
      lowGas: s.lowGas,
      hasTestMoney: s.hasTestMoney,
      modalisPays: s.testnet && Boolean(process.env.FAUCET_PRIVATE_KEY),
      faucetUrl: faucetUrl(),
    });
  });
}

/**
 * One faucet transaction at a time per instance. Two requests racing on the same key would pick
 * the same nonce and one would be dropped.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialised<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "faucet", { max: 3, windowMs: 10 * 60_000 });
    const owner = await requireOwner(request);

    const key = process.env.FAUCET_PRIVATE_KEY;
    const s = await walletState(owner);
    if (!s.testnet) return errorResponse("Test money only exists on the test network.", 404);
    if (!key) {
      return errorResponse("Modalis isn't handing out test money on this deployment.", 501);
    }
    if (s.hasTestMoney && !s.lowGas) {
      return errorResponse("You already have test money, and enough MON for fees.", 409);
    }

    const { rpc } = await getServerContext();
    // Same single-node wallet client the manager uses; this key's only job is the faucet.
    const wallet = createManagerWalletClient(rpc, key);

    const result = await serialised(async () => {
      let gasTx: Hex | null = null;
      let mintTx: Hex | null = null;

      // Fees first, so the person can act even if the mint below fails.
      if (s.lowGas) {
        gasTx = await wallet.sendTransaction({
          to: owner,
          value: GAS_TOP_UP_WEI,
          account: wallet.account!,
          chain: wallet.chain,
        });
        await s.client.waitForTransactionReceipt({ hash: gasTx });
      }

      if (!s.hasTestMoney) {
        const calls = testMoneyCalls(s.deployment, owner);
        if (calls.length > 0) {
          mintTx = await wallet.writeContract({
            address: MULTICALL3_ADDRESS,
            abi: multicall3Abi,
            functionName: "aggregate3",
            args: [calls],
            account: wallet.account!,
            chain: wallet.chain,
          });
          const receipt = await s.client.waitForTransactionReceipt({ hash: mintTx });
          if (receipt.status !== "success") throw new Error("The test money mint reverted.");
        }
      }
      return { gasTx, mintTx };
    }).catch((err: unknown) => {
      log("error", "faucet.failed", { error: err });
      return null;
    });

    if (!result) {
      count("faucet.failed");
      return errorResponse(
        `Modalis couldn't send test money just now. You can get MON for fees at ${faucetUrl()} and try again.`,
        503,
      );
    }
    count("faucet.sent");
    return jsonResponse({ gasReceipt: result.gasTx, mintReceipt: result.mintTx });
  });
}
