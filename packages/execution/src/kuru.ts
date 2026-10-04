/**
 * Kuru execution venue.
 *
 * Route discovery uses the official Kuru SDK's PathFinder against Kuru's own market data, and the
 * resulting route is encoded exactly as KuruAdapter expects:
 *
 *   RouteOutput.route.path[].orderbook  ->  anyToAnySwap._marketAddresses
 *   RouteOutput.isBuy                   ->  anyToAnySwap._isBuy
 *   RouteOutput.nativeSend              ->  anyToAnySwap._nativeSend
 *
 * The SDK is built on ethers v5, so a JsonRpcProvider is constructed here from the same Monad RPC
 * URL the rest of the app uses. The SDK is only consulted for ROUTING; all value protection
 * (minAmountOut) is computed on-chain from the oracle and the user's mandate.
 */
import { getAddress, parseUnits, type Address } from "viem";
import { NoRouteError, type ExecutionVenue, type QuoteRequest, type VenueQuote } from "./types.ts";
import { encodeKuruRoute } from "@modalis/chain";

export type KuruVenueConfig = {
  /** Deployed KuruAdapter address (the on-chain IExecutionAdapter). */
  adapter: Address;
  /** Monad RPC URL the SDK should read markets through. */
  rpcUrl: string;
  /** Kuru API base URL used by PoolFetcher for market discovery. */
  apiUrl: string;
  /**
   * Optional explicit pool set. When provided, PathFinder uses these instead of calling the Kuru
   * API, which makes routing deterministic in tests and on a fork.
   */
  pools?: { baseToken: string; quoteToken: string; orderbook: string }[];
  /** Optional KuruUtils estimator address, passed through to PathFinder. */
  estimatorAddress?: string;
};

export class KuruVenue implements ExecutionVenue {
  readonly name = "kuru" as const;
  readonly adapter: Address;
  private readonly cfg: KuruVenueConfig;

  constructor(cfg: KuruVenueConfig) {
    this.cfg = cfg;
    this.adapter = getAddress(cfg.adapter);
  }

  async quote(req: QuoteRequest): Promise<VenueQuote> {
    // Imported lazily so the package stays usable (and typecheckable) when Kuru is not configured.
    const [{ PathFinder, PoolFetcher }, { ethers }] = await Promise.all([
      import("@kuru-labs/kuru-sdk"),
      import("ethers"),
    ]);

    const provider = new ethers.providers.JsonRpcProvider(this.cfg.rpcUrl);
    // PathFinder takes a float amount of WHOLE tokens.
    const amountInWhole = Number(req.amountIn) / 10 ** req.decimalsIn;

    const poolFetcher = this.cfg.pools ? undefined : new PoolFetcher(this.cfg.apiUrl);

    const result = await PathFinder.findBestPath(
      provider,
      req.tokenIn,
      req.tokenOut,
      amountInWhole,
      "amountIn",
      poolFetcher,
      this.cfg.pools,
      this.cfg.estimatorAddress,
    );

    const path = result?.route?.path ?? [];
    if (path.length === 0 || !result.output || result.output <= 0) {
      throw new NoRouteError(req.tokenIn, req.tokenOut);
    }

    const route = {
      marketAddresses: path.map((p) => getAddress(p.orderbook)),
      isBuy: [...result.isBuy],
      nativeSend: [...result.nativeSend],
    };

    if (route.isBuy.length !== route.marketAddresses.length || route.nativeSend.length !== route.marketAddresses.length) {
      throw new Error(
        `Kuru returned an inconsistent route: ${route.marketAddresses.length} markets, ` +
          `${route.isBuy.length} isBuy, ${route.nativeSend.length} nativeSend`,
      );
    }

    return {
      venue: "kuru",
      adapter: this.adapter,
      adapterData: encodeKuruRoute(route),
      expectedAmountOut: wholeToBaseUnits(result.output, req.decimalsOut),
      route,
      priceImpactBps: Number.isFinite(result.priceImpact) ? Math.round(result.priceImpact * 10_000) : undefined,
    };
  }
}

/**
 * The SDK reports output as a float of whole tokens. Converting through a fixed-precision string
 * avoids the float artefacts you would get from multiplying by 10**decimals directly. This value
 * is advisory only — see the note in types.ts.
 */
export function wholeToBaseUnits(whole: number, decimals: number): bigint {
  if (!Number.isFinite(whole) || whole < 0) throw new Error(`Invalid venue output: ${whole}`);
  return parseUnits(whole.toFixed(Math.min(decimals, 18)), decimals);
}
