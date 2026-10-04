/**
 * Execution is infrastructure, not strategy.
 *
 * The portfolio engine decides "reduce mBTC by 7%, increase mUSD by 7%". A venue decides how that
 * instruction is actually settled. Adding a venue means adding an ExecutionVenue here and an
 * IExecutionAdapter on-chain — nothing in the portfolio logic changes.
 *
 * IMPORTANT: `expectedAmountOut` from a venue is advisory. It is used to pick a route and to warn
 * on bad pricing. The minAmountOut that actually protects the user is derived on-chain from the
 * AssetRegistry oracle and the mandate's maxSlippageBps (see buildProposal in packages/chain), so
 * a venue quote can never widen the slippage the user approved.
 */
import type { Address, Hex } from "viem";

export type VenueName = "kuru" | "mock";

export type QuoteRequest = {
  tokenIn: Address;
  tokenOut: Address;
  /** Base units of tokenIn. */
  amountIn: bigint;
  decimalsIn: number;
  decimalsOut: number;
};

export type KuruRoute = {
  marketAddresses: Address[];
  isBuy: boolean[];
  nativeSend: boolean[];
};

export type VenueQuote = {
  venue: VenueName;
  /** The on-chain IExecutionAdapter that settles this quote. */
  adapter: Address;
  /** Opaque route data handed to the adapter. "0x" for venues that need none. */
  adapterData: Hex;
  /** Advisory expected output in base units of tokenOut. Never used as the slippage floor. */
  expectedAmountOut: bigint;
  route?: KuruRoute;
  priceImpactBps?: number;
};

export interface ExecutionVenue {
  readonly name: VenueName;
  readonly adapter: Address;
  quote(req: QuoteRequest): Promise<VenueQuote>;
}

export class NoRouteError extends Error {
  constructor(tokenIn: Address, tokenOut: Address) {
    super(`No execution route found for ${tokenIn} -> ${tokenOut}`);
    this.name = "NoRouteError";
  }
}
