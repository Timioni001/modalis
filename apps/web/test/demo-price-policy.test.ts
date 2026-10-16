import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEnabled, ownerSigner } from "../lib/demo-price-policy.ts";
const oracle = "0x1000000000000000000000000000000000000001";
test("demo recovery is confined to Monad Testnet and honors an explicit opt-out", () => {
  assert.equal(demoEnabled({ chainId: 10143, oracle }), true);
  assert.equal(demoEnabled({ chainId: 10143, oracle, flag: "false" }), false);
  assert.equal(demoEnabled({ chainId: 143, oracle, flag: "true" }), false);
  assert.equal(demoEnabled({ chainId: 31337, oracle, flag: "true" }), false);
  assert.equal(demoEnabled({ chainId: 10143 }), false);
  assert.equal(demoEnabled({ chainId: 10143, oracle: "invalid" }), false);
});
test("a fallback key must match the existing oracle owner, regardless of key priority", () => {
  const candidates = [
    { address: "0xBAD", label: "primary" },
    { address: "0xABC", label: "faucet" },
  ];
  assert.equal(ownerSigner("0xabc", candidates)?.label, "faucet");
  assert.equal(ownerSigner("0xdef", candidates), null);
});
