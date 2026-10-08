import { test } from "node:test";
import assert from "node:assert/strict";
import { count, redact, resetObservability, scrub, snapshot, timing } from "../lib/observe.ts";

test("an RPC error's URL loses its API key", () => {
  const viemish =
    'HTTP request failed.\nURL: https://monad-testnet.g.alchemy.com/v2/AbCdEfGhIjKlMnOpQrStUvWxYz012345\nRequest body: {"method":"eth_call"}';
  const out = scrub(viemish);
  assert.doesNotMatch(out, /AbCdEfGhIjKlMnOp/);
  assert.match(out, /\/v2\/\[redacted\]/);
});

test("tokens, JWTs, URL credentials and key params are scrubbed", () => {
  const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJ3YWxsZXRfYWRkcmVzcyI6IjB4YSJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ";
  assert.doesNotMatch(scrub(`Bearer ${jwt}`), /eyJhbGci/);
  assert.doesNotMatch(scrub(`token was ${jwt}`), /eyJhbGci/);
  assert.doesNotMatch(scrub("postgres://admin:hunter2@db.example.com/x"), /hunter2/);
  assert.doesNotMatch(scrub("https://rpc.example?apikey=s3cr3tvalue&x=1"), /s3cr3tvalue/);
  assert.doesNotMatch(scrub(`private key: 0x${"ab".repeat(32)}`), /abababab/);
});

test("fields named like secrets are removed whatever they hold", () => {
  const r = redact({ managerPrivateKey: "anything", nested: { apiKey: "x", Authorization: "y" }, ok: "keep" }) as Record<string, unknown>;
  assert.equal(r.managerPrivateKey, "[redacted]");
  assert.deepEqual(r.nested, { apiKey: "[redacted]", Authorization: "[redacted]" });
  assert.equal(r.ok, "keep");
});

test("transaction hashes survive: they are public and needed to debug", () => {
  const hash = `0x${"cd".repeat(32)}`;
  assert.equal(scrub(`settled: ${hash}`), `settled: ${hash}`);
});

test("counters and latency percentiles", () => {
  resetObservability();
  count("api.requests");
  count("api.requests");
  count("policy.refused");
  for (const ms of [10, 20, 30, 40, 1000]) timing(ms);
  const s = snapshot();
  assert.equal(s.counters["api.requests"], 2);
  assert.equal(s.counters["policy.refused"], 1);
  assert.equal(s.latencyMs.p50, 30);
  assert.equal(s.latencyMs.p99, 1000);
});
