import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDsn, sentryEnvelope } from "../lib/error-report.ts";

test("a Sentry DSN becomes its envelope endpoint and public key", () => {
  assert.deepEqual(parseDsn("https://abc123@o42.ingest.sentry.io/7"), {
    endpoint: "https://o42.ingest.sentry.io/api/7/envelope/",
    key: "abc123",
  });
  assert.equal(parseDsn(undefined), null);
  assert.equal(parseDsn("not a dsn"), null);
});

test("the envelope scrubs secrets out of the message", () => {
  const body = sentryEnvelope(new Error("RPC failed: https://monad.g.alchemy.com/v2/abcdefghijklmnopqrstuvwxyz"), { route: "x" });
  const [, , event] = body.split("\n");
  const parsed = JSON.parse(event);
  assert.equal(parsed.level, "error");
  assert.ok(!event.includes("abcdefghijklmnopqrstuvwxyz"), "the API key must not be sent");
});
