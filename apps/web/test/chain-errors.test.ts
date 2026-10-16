import { test } from "node:test";
import assert from "node:assert/strict";
import { chainFailure } from "../lib/chain-errors.ts";
test("oracle errors are actionable and do not leak RPC credentials", () => {
  const error = { message: "https://rpc.test/private-key", cause: { data: { errorName: "PRICE_STALE" } } };
  const failure = chainFailure(error);
  assert.equal(failure?.status, 503);
  assert.equal(failure?.code, "prices_unavailable");
  assert.ok(!failure?.message.includes("private-key"));
  assert.equal(chainFailure(new Error("Other failure")), null);
});
test("cyclic upstream causes cannot hang error handling", () => {
  const error: { cause?: unknown } = {};
  error.cause = error;
  assert.equal(chainFailure(error), null);
});
