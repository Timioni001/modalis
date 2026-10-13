import { test } from "node:test";
import assert from "node:assert/strict";
import { browserClient } from "../lib/chain-client.ts";
test("the browser does not send reads through nonexistent local Multicall3", () => {
  const local = browserClient(10143, "http://127.0.0.1:8545");
  assert.equal(local.batch?.multicall, undefined);
  assert.equal(browserClient(10143, "http://127.0.0.1:8545"), local);
  assert.ok(browserClient(10143, "https://testnet-rpc.monad.xyz").batch?.multicall);
});
