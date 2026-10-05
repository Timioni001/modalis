/**
 * The API's ownership rules, enforced against the routes themselves.
 *
 * The hole this closes: a route used to read `{"owner": "0x..."}` from its body and act on it, so
 * anyone could make the Modalis manager key work on anyone else's plan. The fix was to take the
 * acting account from a verified session and nowhere else.
 *
 * A fix is only worth as much as what stops it regressing. A route added next month with no
 * `requireOwner` would reopen the hole silently, and no unit test of an existing route would
 * notice. So this audits every route file in the app:
 *
 *   1. Every state-changing route establishes who is asking from a verified session.
 *   2. No route takes an account, owner or wallet address from its request body or path.
 *   3. Every route funnels its failures through the shared handler, so nothing leaks a stack.
 *   4. Routes that are deliberately public are listed here, each with its reason.
 *
 * The verified-session machinery itself is tested in packages/auth, against real signatures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const API_DIR = new URL("../app/api", import.meta.url).pathname;

/**
 * Routes that may be called without signing in, and why.
 *
 * Each one is listed with the reason it is safe: it discloses nothing about any person, and it
 * changes nothing. Anything that touches a person's money or plan is absent from this list by
 * definition.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  "status/route.ts":
    "Deployment facts and public addresses only. No personal data, nothing changed.",
  "plan/draft/route.ts":
    "Shows what a plan WOULD look like. Writes nothing, reads nobody's money, and signing in is " +
    "only needed to make a plan real.",
  "plan/compare/route.ts":
    "Answers a 'what if' from numbers the caller supplied. Writes nothing and reads nobody's money.",
};

/** Patterns that would mean an account came from the caller rather than from a verified session. */
const FORBIDDEN_INPUT_PATTERNS: [RegExp, string][] = [
  [/body[?.]*\.\s*owner\b/, "reads an owner from the request body"],
  [/body[?.]*\.\s*walletAddress\b/, "reads a wallet address from the request body"],
  [/body[?.]*\.\s*address\b/, "reads an address from the request body"],
  [/body[?.]*\.\s*account\b/, "reads an account from the request body"],
  // Destructuring an owner out of something, as opposed to passing the verified one into a call.
  [
    /(?:const|let|var)\s*\{[^}]*\bowner\b[^}]*\}\s*=/,
    "destructures an owner out of caller input",
  ],
  [/params[?.]*\.\s*owner\b/, "takes an owner from the URL path"],
  [/searchParams\.get\(\s*["'](owner|address|wallet)["']\s*\)/, "takes an account from the query string"],
];

function routeFiles(dir: string, prefix = ""): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...routeFiles(path, `${prefix}${name}/`));
    else if (name === "route.ts") out.push({ id: `${prefix}${name}`, path });
  }
  return out;
}

const ROUTES = routeFiles(API_DIR).map(({ id, path }) => ({
  id,
  source: readFileSync(path, "utf8"),
}));

/** Source with comments removed: what the code does, not what it says about itself. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const MUTATING = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/;

test("the audit found the API to audit", () => {
  assert.ok(ROUTES.length >= 15, `expected to find the app's routes, found ${ROUTES.length}`);
  for (const key of Object.keys(PUBLIC_ROUTES)) {
    assert.ok(
      ROUTES.some((r) => r.id === key),
      `${key} is listed as public but no longer exists — remove it from the list`,
    );
  }
});

test("every state-changing route establishes who is asking from a verified session", () => {
  const offenders: string[] = [];
  for (const { id, source } of ROUTES) {
    const body = code(source);
    if (!MUTATING.test(body)) continue;
    if (id in PUBLIC_ROUTES) continue;
    const verified = /\brequireOwner\s*\(|\brequireOwnerMatching\s*\(/.test(body);
    if (!verified) offenders.push(id);
  }
  assert.deepEqual(
    offenders,
    [],
    "these routes change something without a verified account:\n  " + offenders.join("\n  "),
  );
});

test("every route that reads a person's own data requires them to be signed in", () => {
  // A GET that returns one person's money, plan, progress or history is as sensitive as a write.
  const personal = ["money", "plan", "progress", "adjustment", "activity"];
  const offenders: string[] = [];

  for (const { id, source } of ROUTES) {
    if (id in PUBLIC_ROUTES) continue;
    const top = id.split("/")[0];
    if (!personal.includes(top)) continue;
    if (!/export\s+async\s+function\s+GET\b/.test(code(source))) continue;
    if (!/\brequireOwner\s*\(|\brequireOwnerMatching\s*\(/.test(code(source))) offenders.push(id);
  }

  assert.deepEqual(
    offenders,
    [],
    "these routes return personal data without a verified account:\n  " + offenders.join("\n  "),
  );
});

test("no route takes an account from its own input", () => {
  const offenders: string[] = [];
  for (const { id, source } of ROUTES) {
    const body = code(source);
    for (const [pattern, why] of FORBIDDEN_INPUT_PATTERNS) {
      if (pattern.test(body)) offenders.push(`${id}: ${why}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "an account must come from a verified session, never from the caller:\n  " +
      offenders.join("\n  "),
  );
});

test("the account a route acts on comes from requireOwner and is used as-is", () => {
  // The idiom is `const owner = await requireOwner(request)`. Anything that then reassigns or
  // overrides it would defeat the check, so the name must be bound once per handler.
  for (const { id, source } of ROUTES) {
    const body = code(source);
    const bindings = [...body.matchAll(/const\s+owner\s*=\s*await\s+requireOwner\s*\(/g)];
    const anyOwnerBinding = [...body.matchAll(/\bowner\s*=/g)];
    if (bindings.length === 0) continue;
    assert.equal(
      anyOwnerBinding.length,
      bindings.length,
      `${id}: the acting account is reassigned after being verified`,
    );
  }
});

test("every route funnels failures through the shared handler", () => {
  const offenders: string[] = [];
  for (const { id, source } of ROUTES) {
    const body = code(source);
    // `route()` wraps the handler and turns auth and domain failures into clean responses.
    // /api/status answers even when everything is down, so it handles its own.
    if (id === "status/route.ts") continue;
    if (!/\broute\s*\(\s*async\b/.test(body)) offenders.push(id);
  }
  assert.deepEqual(
    offenders,
    [],
    "these routes could leak an internal error to a person:\n  " + offenders.join("\n  "),
  );
});

test("the routes that handle money or adjustments are all protected", () => {
  // Named explicitly, so deleting the gate from one of these fails loudly rather than quietly
  // dropping out of a glob.
  const mustBeProtected = [
    "money/route.ts",
    "money/wallet/route.ts",
    "money/funding-plan/route.ts",
    "money/confirm/route.ts",
    "adjustment/route.ts",
    "adjustment/execute/route.ts",
    "plan/route.ts",
    "plan/status/route.ts",
    "plan/approve/route.ts",
    "progress/route.ts",
    "activity/route.ts",
    "demo/scenario/route.ts",
    "demo/security-test/route.ts",
  ];

  for (const id of mustBeProtected) {
    const route = ROUTES.find((r) => r.id === id);
    assert.ok(route, `${id} is missing — if it was renamed, update this list`);
    assert.match(
      code(route.source),
      /\brequireOwner\s*\(|\brequireOwnerMatching\s*\(/,
      `${id} must act only on a verified account`,
    );
    assert.ok(
      !(id in PUBLIC_ROUTES),
      `${id} must never be listed as a public route`,
    );
  }
});

test("carrying out an adjustment also checks the person still permits it", () => {
  // Authentication answers "who is asking". It does not answer "is Modalis allowed to do this",
  // which is the person's own permission and ultimately the contract's decision.
  const execute = ROUTES.find((r) => r.id === "adjustment/execute/route.ts");
  assert.ok(execute);
  const body = code(execute.source);
  assert.match(body, /adjustmentsEnabled/, "it must check the person still permits adjustments");
  assert.match(body, /403/, "and refuse with a clear status when they do not");
});

test("no route signs for a person, and none handles a user's private key", () => {
  const offenders: string[] = [];
  for (const { id, source } of ROUTES) {
    const body = code(source);
    // The manager key may propose adjustments. Nothing server-side may ever hold a user key or
    // write a plan, which is what makes a plan a boundary on Modalis rather than a formality.
    if (/\bsetMandate\s*\(/.test(body)) offenders.push(`${id}: a server must never write a plan`);
    if (/\bemergencyWithdraw\s*\(|\bwithdraw\s*\(/.test(body)) {
      offenders.push(`${id}: a server must never move money out`);
    }
    if (/\bdeposit\s*\(/.test(body)) offenders.push(`${id}: a server must never move money in`);
    if (/USER_PRIVATE_KEY|OWNER_PRIVATE_KEY/.test(body)) {
      offenders.push(`${id}: a server must never hold a person's key`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n  "));
});
