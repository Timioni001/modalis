/**
 * Replay protection, rate limiting and request validation.
 *
 * These exist because of what a person actually does: taps a button twice, loses signal
 * mid-request, hits back and retries. Without a one-time key each of those does the work again —
 * a second database row, a second gas spend by the manager key, a second confusing entry in their
 * activity. The chain protects the money; this protects the person from not knowing what happened.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DuplicateRequest, TooManyRequests, callerHint, limit, once, resetGuards } from "../lib/guard.ts";
import { InvalidRequest, integer, money, oneOf, readBody, receiptReference, text, idempotencyKey } from "../lib/validate.ts";

const OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

beforeEach(() => resetGuards());

const ok = (payload: unknown) => Response.json(payload);

// --------------------------------------------------------------- idempotency

test("the same one-time key does the work once and replays the answer", async () => {
  let ran = 0;
  const work = async () => {
    ran++;
    return ok({ receipt: "0xabc", ran });
  };

  const first = await once(OWNER, "money:confirm", "key-1", work);
  const second = await once(OWNER, "money:confirm", "key-1", work);

  assert.equal(ran, 1, "a repeat must not do the work again");
  assert.equal(second.headers.get("x-modalis-replayed"), "1");
  assert.deepEqual(await second.json(), await first.json(), "the replay is the original answer");
});

test("a different key is a different intent and does the work again", async () => {
  let ran = 0;
  const work = async () => ok({ ran: ++ran });

  await once(OWNER, "money:confirm", "key-1", work);
  await once(OWNER, "money:confirm", "key-2", work);
  assert.equal(ran, 2);
});

test("one person's key cannot replay another person's result", async () => {
  await once(OWNER, "money:confirm", "shared-key", async () => ok({ secret: "mine" }));

  let ran = 0;
  const other = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const response = await once(other, "money:confirm", "shared-key", async () => {
    ran++;
    return ok({ secret: "theirs" });
  });

  assert.equal(ran, 1, "the key is scoped to the account, so this is new work");
  assert.deepEqual(await response.json(), { secret: "theirs" });
});

test("the same key on a different operation is not a replay", async () => {
  await once(OWNER, "money:confirm", "key-1", async () => ok({ a: 1 }));
  const response = await once(OWNER, "adjustment:execute", "key-1", async () => ok({ b: 2 }));
  assert.deepEqual(await response.json(), { b: 2 });
});

test("a request still in flight is refused rather than answered optimistically", async () => {
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = once(OWNER, "money:confirm", "slow", async () => {
    await blocked;
    return ok({ done: true });
  });

  // Saying "ok" to something still happening is how a person comes to believe money moved twice.
  await assert.rejects(
    () => once(OWNER, "money:confirm", "slow", async () => ok({ done: true })),
    (err: unknown) => err instanceof DuplicateRequest && err.status === 409,
  );

  release!();
  await first;
});

test("a failure is retryable immediately, because it may have been transient", async () => {
  let ran = 0;
  const failing = async () => {
    ran++;
    return Response.json({ error: "the node was unreachable" }, { status: 503 });
  };

  await once(OWNER, "money:confirm", "retry-me", failing);
  await once(OWNER, "money:confirm", "retry-me", failing);
  assert.equal(ran, 2, "a failed attempt must not be cached as the answer");
});

test("a thrown handler releases the key instead of wedging it", async () => {
  await assert.rejects(() =>
    once(OWNER, "money:confirm", "throws", async () => {
      throw new Error("the chain read failed");
    }),
  );

  // If the key were left in flight, the person could never retry.
  const response = await once(OWNER, "money:confirm", "throws", async () => ok({ recovered: true }));
  assert.deepEqual(await response.json(), { recovered: true });
});

// -------------------------------------------------------------- rate limiting

test("a burst is allowed up to the limit, then refused with how long to wait", () => {
  for (let i = 0; i < 5; i++) limit(OWNER, "adjustment:execute", { max: 5, windowMs: 60_000 });

  assert.throws(
    () => limit(OWNER, "adjustment:execute", { max: 5, windowMs: 60_000 }),
    (err: unknown) => {
      assert.ok(err instanceof TooManyRequests);
      assert.equal(err.status, 429);
      assert.ok(err.retryAfterSeconds > 0, "a person should be told when to come back");
      assert.match(err.message, /try again in/i);
      return true;
    },
  );
});

test("the limit is per person, so one caller cannot lock out another", () => {
  for (let i = 0; i < 5; i++) limit(OWNER, "plan:draft", { max: 5, windowMs: 60_000 });
  // A different account starts with a full allowance.
  limit("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", "plan:draft", { max: 5, windowMs: 60_000 });
});

test("the limit is per operation, so reading is not blocked by writing", () => {
  for (let i = 0; i < 5; i++) limit(OWNER, "adjustment:execute", { max: 5, windowMs: 60_000 });
  limit(OWNER, "money:funding-plan", { max: 5, windowMs: 60_000 });
});

test("the window reopens once it has passed", async () => {
  limit(OWNER, "short", { max: 1, windowMs: 40 });
  assert.throws(() => limit(OWNER, "short", { max: 1, windowMs: 40 }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  limit(OWNER, "short", { max: 1, windowMs: 40 });
});

test("an anonymous caller is identified by a hint, never trusted as identity", () => {
  const forwarded = new Request("https://modalis.test/api/plan/draft", {
    headers: { "x-forwarded-for": "203.0.113.5, 198.51.100.1" },
  });
  // Only the first entry: the rest are proxy-appended and caller-controlled.
  assert.equal(callerHint(forwarded), "203.0.113.5");
  assert.equal(callerHint(new Request("https://modalis.test/")), "anonymous");
});

// ----------------------------------------------------------------- validation

test("money arrives as a decimal string, never as a float", async () => {
  assert.equal(money("500", "an amount"), "500");
  assert.equal(money(" 500.25 ", "an amount"), "500.25");

  // A JavaScript number loses cents above 2^53 and cannot represent 0.1 exactly. Refusing it
  // outright is the only way to be sure the amount a person typed is the amount that moves.
  assert.throws(() => money(500, "an amount"), InvalidRequest);
  for (const bad of ["", "abc", "-5", "0", "1,000", "1e5", "5.123", "0.001"]) {
    assert.throws(() => money(bad, "an amount"), InvalidRequest, `"${bad}" should be refused`);
  }
});

test("a money error is a sentence someone can act on", () => {
  try {
    money("abc", "an amount");
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof InvalidRequest);
    assert.match(err.message, /like 500/, "the error should show the shape we want");
    assert.ok(!err.message.includes("abc"), "and never echo the input back into the page");
  }
});

test("an absurd amount is refused before it reaches the chain", () => {
  assert.throws(() => money("999999999999", "an amount"), InvalidRequest);
});

test("whole numbers are bounded", () => {
  assert.equal(integer(60, "months"), 60);
  assert.equal(integer("60", "months"), 60);
  assert.throws(() => integer(5, "months", { min: 6, max: 360 }), InvalidRequest);
  assert.throws(() => integer(1000, "months", { min: 6, max: 360 }), InvalidRequest);
  assert.throws(() => integer(1.5, "months", { min: 1, max: 10 }), InvalidRequest);
});

test("a choice has to be one of the choices, and the error names them", () => {
  assert.equal(oneOf("monthly", "how often", ["weekly", "monthly"] as const), "monthly");
  try {
    oneOf("daily", "how often", ["weekly", "monthly"] as const);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof InvalidRequest);
    assert.match(err.message, /weekly, monthly/);
  }
});

test("free text is bounded and stripped of control characters", () => {
  assert.equal(text("A house deposit", "your goal"), "A house deposit");
  assert.equal(text(undefined, "your goal"), undefined);
  // Control characters are how a log line or an AI prompt gets forged.
  assert.equal(text("hello\u0000\u001bworld", "your goal"), "helloworld");
  assert.throws(() => text("x".repeat(600), "your goal", { max: 500 }), InvalidRequest);
});

test("a receipt is checked for shape here and against the chain before it is believed", () => {
  const hash = `0x${"a".repeat(64)}`;
  assert.equal(receiptReference(hash.toUpperCase()), hash, "normalised, so it compares reliably");
  for (const bad of ["", "0x", "0xzz", `0x${"a".repeat(63)}`, 42]) {
    assert.throws(() => receiptReference(bad), InvalidRequest);
  }
});

test("a one-time key has to look like one", () => {
  assert.equal(idempotencyKey("a1b2c3d4e5f6"), "a1b2c3d4e5f6");
  for (const bad of ["short", "", "has spaces", "x".repeat(200), 12345, null]) {
    assert.throws(() => idempotencyKey(bad), InvalidRequest);
  }
});

test("a body that is not an object is refused rather than crashing the route", async () => {
  const bad = (body: string, type = "application/json") =>
    new Request("https://modalis.test/api/money/confirm", {
      method: "POST",
      headers: { "content-type": type },
      body,
    });

  await assert.rejects(() => readBody(bad("not json")), InvalidRequest);
  await assert.rejects(() => readBody(bad("[1,2,3]")), InvalidRequest);
  await assert.rejects(() => readBody(bad("null")), InvalidRequest);
  await assert.rejects(() => readBody(bad("{}", "text/plain")), InvalidRequest);

  assert.deepEqual(await readBody(bad('{"amount":"500"}')), { amount: "500" });
});
