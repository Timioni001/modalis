/**
 * Persistence must never break the financial flow.
 *
 * The chain is the source of truth for everything that matters. The database holds goals,
 * answers, explanations and a record of the adjustments a person's rules refused — all useful,
 * none load-bearing. So if a write fails, the person's plan is still live and their money is
 * still theirs, and the request they were making must still succeed.
 *
 * These tests pin that down, because the failure mode is invisible: a `throw` added inside a
 * repository would turn a successful deposit into a 500 for the person who made it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tolerate, logDbFailure } from "../src/errors.ts";
import {
  browserClient,
  dbConfigFromEnv,
  isBrowserDbConfigured,
  isServerDbConfigured,
  resetClientCache,
  serverClient,
} from "../src/client.ts";

test("a failing write never rejects the request it was part of", async () => {
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (msg: unknown) => warnings.push(String(msg));
  try {
    const result = await tolerate("recordTransaction", async () => {
      throw new Error("connection refused");
    });
    assert.equal(result, null, "a failed write reports nothing, it does not throw");
  } finally {
    console.warn = realWarn;
  }
  assert.equal(warnings.length, 1, "but it is never silent");
  assert.match(warnings[0], /recordTransaction/);
  assert.match(warnings[0], /continuing without persistence/);
});

test("a successful write passes its value straight through", async () => {
  assert.deepEqual(await tolerate("x", async () => ({ id: "abc" })), { id: "abc" });
  // null and false are real values, not failures.
  assert.equal(await tolerate("x", async () => null), null);
  assert.equal(await tolerate("x", async () => false), false);
});

test("a synchronous throw inside a write is tolerated too", async () => {
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(
      await tolerate("x", () => {
        throw new TypeError("undefined is not a function");
      }),
      null,
    );
  } finally {
    console.warn = realWarn;
  }
});

test("a failure is logged with enough to find it, and without a stack", () => {
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (msg: unknown) => warnings.push(String(msg));
  try {
    logDbFailure("saveInterview", new Error("permission denied for table users"));
  } finally {
    console.warn = realWarn;
  }
  assert.match(warnings[0], /saveInterview/);
  assert.match(warnings[0], /permission denied/);
  assert.ok(!warnings[0].includes("at "), "a log line should not carry a stack trace");
});

test("with no database configured, the product runs without one", () => {
  const nothing = dbConfigFromEnv({});
  assert.equal(isServerDbConfigured(nothing), false);
  assert.equal(isBrowserDbConfigured(nothing), false);

  resetClientCache();
  assert.equal(serverClient(nothing), null, "no client rather than a broken one");
  assert.equal(browserClient("some-token", nothing), null);
  resetClientCache();
});

test("configuration is read from the right variables, and the key that matters is not public", () => {
  const cfg = dbConfigFromEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  });
  assert.equal(cfg.url, "https://example.supabase.co");
  assert.equal(cfg.anonKey, "anon-key");
  assert.equal(cfg.serviceRoleKey, "service-role-key");

  // The privileged key must never be readable from a NEXT_PUBLIC_ variable, because anything
  // under that prefix is compiled into the browser bundle.
  const publicised = dbConfigFromEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "oops",
  });
  assert.equal(publicised.serviceRoleKey, undefined);
  assert.equal(isServerDbConfigured(publicised), false);
});

test("the privileged client refuses to exist in a browser", () => {
  const env = dbConfigFromEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  });
  resetClientCache();
  const realWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {};
  try {
    // The service-role key bypasses every row-level rule. Shipping it to a browser would hand
    // every visitor everyone else's data, so this throws rather than degrading.
    assert.throws(() => serverClient(env), /browser|server/i);
  } finally {
    if (realWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = realWindow;
    resetClientCache();
  }
});
