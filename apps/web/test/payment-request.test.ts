import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paymentAmount,
  paymentRequestPath,
  readPaymentRequest,
} from "../lib/payment-request.ts";
const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
test("payment requests round-trip exact amounts and escaped human purposes", () => {
  const path = paymentRequestPath(recipient, "10.123456", "School & lunch? #1");
  const query = new URL(path, "https://demo.test").searchParams;
  assert.equal(query.get("for"), "School & lunch? #1");
  assert.deepEqual(readPaymentRequest(query), {
    amount: 10.123456,
    error: null,
  });
  assert.equal(query.get("chain"), "10143");
});
test("requests refuse unsafe addresses and unusable money values", () => {
  for (const raw of [
    "NaN",
    "Infinity",
    "1e6",
    "-10",
    "0",
    "1000001",
    "1.0000001",
    " 10",
    "01",
    "",
  ])
    assert.equal(paymentAmount(raw), null, raw);
  assert.throws(() => paymentRequestPath("0x" + "0".repeat(40), "10", ""));
  assert.throws(() => paymentRequestPath("javascript:alert(1)", "10", ""));
  assert.throws(() => paymentRequestPath(recipient, "1e9", ""));
});
test("external links cannot silently change asset, chain or amount", () => {
  for (const raw of [
    "chain=143",
    "chain=1",
    "asset=USDC",
    "amount=-1",
    "amount=1e6",
  ])
    assert.ok(readPaymentRequest(new URLSearchParams(raw)).error);
  assert.deepEqual(readPaymentRequest(new URLSearchParams()), {
    amount: 25,
    error: null,
  });
  assert.equal(paymentAmount("0.000001"), "0.000001");
});
