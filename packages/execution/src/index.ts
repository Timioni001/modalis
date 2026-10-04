/**
 * @modalis/execution — venue selection.
 *
 * Kuru is the real execution venue. The mock adapter exists so the complete loop is runnable
 * locally and on testnet without external liquidity; it is selected only when Kuru is not
 * configured, and the UI must label it as a demo venue.
 */
import { getAddress, isAddress, type Address } from "viem";
import { KuruVenue, type KuruVenueConfig } from "./kuru.ts";
import { MockVenue, type Converter } from "./mock.ts";
import type { ExecutionVenue } from "./types.ts";

export * from "./types.ts";
export { KuruVenue, wholeToBaseUnits } from "./kuru.ts";
export { MockVenue } from "./mock.ts";
export type { KuruVenueConfig } from "./kuru.ts";
export type { Converter } from "./mock.ts";

export type VenueSelection = {
  venue: ExecutionVenue;
  /** Why this venue was chosen — surfaced in the UI so the venue is never ambiguous. */
  reason: string;
  isDemoVenue: boolean;
};

export type SelectVenueOptions = {
  env?: Record<string, string | undefined>;
  /** Required for the mock venue: reads AssetRegistry.convert. */
  convert: Converter;
  /** Monad RPC URL, needed by the Kuru SDK. */
  rpcUrl?: string;
  /**
   * Deployed adapter addresses, normally taken straight from the deployment record. These win
   * over the environment, so a caller that already knows what is deployed does not have to
   * mirror it into env vars first.
   */
  adapters?: { kuruAdapter?: Address; demoAdapter?: Address };
  /** Overrides for local/fork testing. */
  kuru?: Partial<KuruVenueConfig>;
};

/**
 * Picks Kuru when it is genuinely configured — a deployed KuruAdapter plus a Kuru API URL —
 * and the demo adapter otherwise. There is no third state: we never claim Kuru execution
 * without a KuruAdapter address to settle through.
 */
export function selectVenue(opts: SelectVenueOptions): VenueSelection {
  const env = opts.env ?? process.env;

  const kuruAdapter =
    opts.adapters?.kuruAdapter ?? opts.kuru?.adapter ?? env.NEXT_PUBLIC_KURU_ADAPTER_ADDRESS?.trim();
  const kuruApiUrl = opts.kuru?.apiUrl ?? env.KURU_API_URL?.trim();
  const rpcUrl = opts.rpcUrl ?? env.NEXT_PUBLIC_MONAD_RPC_URL ?? env.MONAD_TESTNET_RPC_URL;

  if (kuruAdapter && isAddress(kuruAdapter) && kuruApiUrl && rpcUrl) {
    return {
      venue: new KuruVenue({
        adapter: getAddress(kuruAdapter),
        apiUrl: kuruApiUrl,
        rpcUrl,
        pools: opts.kuru?.pools,
        estimatorAddress: opts.kuru?.estimatorAddress ?? env.KURU_UTILS_ADDRESS,
      }),
      reason: "Kuru orderbook (KuruAdapter deployed and Kuru API configured)",
      isDemoVenue: false,
    };
  }

  const mockAdapter = opts.adapters?.demoAdapter ?? env.NEXT_PUBLIC_EXECUTION_ADAPTER_ADDRESS?.trim();
  if (!mockAdapter || !isAddress(mockAdapter)) {
    throw new Error(
      "No execution venue available. Set NEXT_PUBLIC_KURU_ADAPTER_ADDRESS + KURU_API_URL for " +
        "Kuru, or NEXT_PUBLIC_EXECUTION_ADAPTER_ADDRESS for the demo adapter.",
    );
  }

  return {
    venue: new MockVenue(getAddress(mockAdapter), opts.convert),
    reason: missingKuruReason(kuruAdapter, kuruApiUrl, rpcUrl),
    isDemoVenue: true,
  };
}

function missingKuruReason(adapter?: string, apiUrl?: string, rpcUrl?: string): string {
  const missing: string[] = [];
  if (!adapter || !isAddress(adapter)) missing.push("NEXT_PUBLIC_KURU_ADAPTER_ADDRESS");
  if (!apiUrl) missing.push("KURU_API_URL");
  if (!rpcUrl) missing.push("a Monad RPC URL");
  return `Demo adapter (oracle-priced, not a venue) — Kuru unavailable: missing ${missing.join(", ")}`;
}

/** Adapter address for a venue, for the proposal that will settle through it. */
export function adapterAddressOf(selection: VenueSelection): Address {
  return selection.venue.adapter;
}
