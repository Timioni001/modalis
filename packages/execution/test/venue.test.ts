import assert from "node:assert/strict";
import test from "node:test";
import { MockVenue, selectVenue, wholeToBaseUnits } from "../src/index.ts";
import type { Address } from "viem";

const ADAPTER = "0x00000000000000000000000000000000000000a1" as Address;
const KURU_ADAPTER = "0x00000000000000000000000000000000000000b2" as Address;
const TOKEN_IN = "0x00000000000000000000000000000000000000c3" as Address;
const TOKEN_OUT = "0x00000000000000000000000000000000000000d4" as Address;

const convert = async () => 1_000_000n;

test("mock venue applies its spread and needs no route data", async () => {
  const venue = new MockVenue(ADAPTER, convert, 10);
  const q = await venue.quote({
    tokenIn: TOKEN_IN,
    tokenOut: TOKEN_OUT,
    amountIn: 1n,
    decimalsIn: 8,
    decimalsOut: 6,
  });
  assert.equal(q.venue, "mock");
  assert.equal(q.adapterData, "0x");
  // 1_000_000 less 10 bps
  assert.equal(q.expectedAmountOut, 999_000n);
});

test("selectVenue prefers Kuru when it is genuinely configured", () => {
  const sel = selectVenue({
    convert,
    env: {
      NEXT_PUBLIC_KURU_ADAPTER_ADDRESS: KURU_ADAPTER,
      KURU_API_URL: "https://api.example.invalid",
      NEXT_PUBLIC_MONAD_RPC_URL: "https://rpc.example.invalid",
    },
  });
  assert.equal(sel.venue.name, "kuru");
  assert.equal(sel.isDemoVenue, false);
});

test("selectVenue falls back to the demo adapter and says exactly what is missing", () => {
  const sel = selectVenue({
    convert,
    env: { NEXT_PUBLIC_EXECUTION_ADAPTER_ADDRESS: ADAPTER },
  });
  assert.equal(sel.venue.name, "mock");
  assert.equal(sel.isDemoVenue, true);
  assert.match(sel.reason, /KURU_API_URL/);
  assert.match(sel.reason, /not a venue/);
});

test("selectVenue does not silently pick Kuru when only the adapter is set", () => {
  const sel = selectVenue({
    convert,
    env: {
      NEXT_PUBLIC_KURU_ADAPTER_ADDRESS: KURU_ADAPTER,
      NEXT_PUBLIC_EXECUTION_ADAPTER_ADDRESS: ADAPTER,
    },
  });
  assert.equal(sel.venue.name, "mock");
});

test("selectVenue refuses to invent a venue when nothing is deployed", () => {
  assert.throws(() => selectVenue({ convert, env: {} }), /No execution venue available/);
});

test("wholeToBaseUnits converts without float artefacts", () => {
  assert.equal(wholeToBaseUnits(1.5, 6), 1_500_000n);
  assert.equal(wholeToBaseUnits(0.07, 8), 7_000_000n);
  assert.equal(wholeToBaseUnits(0, 18), 0n);
});
