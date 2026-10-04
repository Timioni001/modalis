/**
 * MockExecutionAdapter venue.
 *
 * TESTNET / LOCAL ONLY. Fills at the AssetRegistry oracle price less a fixed spread from
 * pre-funded inventory, so the full product loop runs without external liquidity. It is not a
 * venue and must never be presented as one: the UI labels it "demo venue".
 *
 * The adapter needs no route data, so adapterData is empty.
 */
import { getAddress, type Address } from "viem";
import type { ExecutionVenue, QuoteRequest, VenueQuote } from "./types.ts";

/** Reads the oracle-implied output for a swap. Backed by AssetRegistry.convert. */
export type Converter = (tokenIn: Address, tokenOut: Address, amountIn: bigint) => Promise<bigint>;

export class MockVenue implements ExecutionVenue {
  readonly name = "mock" as const;
  readonly adapter: Address;
  private readonly convert: Converter;
  private readonly spreadBps: bigint;

  constructor(adapter: Address, convert: Converter, spreadBps = 10) {
    this.adapter = getAddress(adapter);
    this.convert = convert;
    this.spreadBps = BigInt(spreadBps);
  }

  async quote(req: QuoteRequest): Promise<VenueQuote> {
    const oracleOut = await this.convert(req.tokenIn, req.tokenOut, req.amountIn);
    return {
      venue: "mock",
      adapter: this.adapter,
      adapterData: "0x",
      expectedAmountOut: (oracleOut * (10_000n - this.spreadBps)) / 10_000n,
    };
  }
}
