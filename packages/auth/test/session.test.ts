/**
 * Who is asking, and what they are allowed to act on.
 *
 * The hole this package closed: a request body used to name its own owner, so anyone could post
 * `{"owner":"0x<someone else>"}` and make the Modalis manager key act on that person's plan. The
 * contracts still protected the money — nothing could be stolen — but it allowed griefing and
 * burned someone else's gas.
 *
 * These tests sign REAL tokens with a real key pair and verify them through the real JWKS path,
 * served from a throwaway localhost server. A stubbed verifier would prove nothing: the point is
 * that a token signed by the wrong key is refused.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { SignJWT, exportJWK, generateKeyPair, type JWK, type CryptoKey } from "jose";
import {
  AuthError,
  assertOwns,
  authConfigFromEnv,
  bearerToken,
  isAuthConfigured,
  peekToken,
  readSession,
  requireSession,
  verifyToken,
  walletFromClaims,
  type AuthConfig,
} from "../src/session.ts";

const OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const SOMEONE_ELSE = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const ENVIRONMENT_ID = "env-under-test";

let server: Server;
let config: AuthConfig;
let signingKey: CryptoKey;
let attackerKey: CryptoKey;

before(async () => {
  const real = await generateKeyPair("RS256", { extractable: true });
  const attacker = await generateKeyPair("RS256", { extractable: true });
  signingKey = real.privateKey;
  attackerKey = attacker.privateKey;

  const jwk = (await exportJWK(real.publicKey)) as JWK;
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  config = {
    jwksUrl: `http://127.0.0.1:${port}/jwks`,
    environmentId: ENVIRONMENT_ID,
    allowDevAuth: false,
    chainId: 10143,
  };
});

after(() => {
  server?.close();
});

async function signedToken(
  claims: Record<string, unknown>,
  options: { key?: CryptoKey; audience?: string; expiresIn?: string } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt()
    .setAudience(options.audience ?? ENVIRONMENT_ID)
    .setExpirationTime(options.expiresIn ?? "1h")
    .sign(options.key ?? signingKey);
}

const requestWith = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

// ------------------------------------------------- a real sign-in is accepted

test("a properly signed token establishes who is asking", async () => {
  const token = await signedToken({ sub: "user-1", wallet_address: OWNER, email: "a@b.test" });
  const session = await verifyToken(token, config);

  assert.equal(session.walletAddress, OWNER);
  assert.equal(session.userId, "user-1");
  assert.equal(session.email, "a@b.test");
  assert.equal(session.via, "dynamic");
  assert.ok(session.expiresAt instanceof Date);
});

test("the wallet is read from either shape the sign-in provider emits", async () => {
  const flat = await signedToken({ wallet_address: OWNER });
  assert.equal((await verifyToken(flat, config)).walletAddress, OWNER);

  const credentials = await signedToken({
    verified_credentials: [
      { format: "email", email: "a@b.test" },
      { format: "blockchain", address: OWNER.toLowerCase(), chain: "eip155" },
    ],
  });
  // Checksummed on the way out, so comparisons are never case-sensitive by accident.
  assert.equal((await verifyToken(credentials, config)).walletAddress, OWNER);
});

test("an email-only sign-in has no account to act on, and says so", async () => {
  const token = await signedToken({
    verified_credentials: [{ format: "email", email: "a@b.test" }],
  });
  await assert.rejects(
    () => verifyToken(token, config),
    (err: unknown) => err instanceof AuthError && err.code === "no_wallet_in_token",
  );
});

// -------------------------------------------------- forged sign-ins are refused

test("a token signed by the wrong key is refused", async () => {
  const forged = await signedToken({ wallet_address: OWNER }, { key: attackerKey });
  await assert.rejects(
    () => verifyToken(forged, config),
    (err: unknown) => err instanceof AuthError && err.code === "invalid_token" && err.status === 401,
  );
});

test("an expired token is refused", async () => {
  const stale = await new SignJWT({ wallet_address: OWNER })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setAudience(ENVIRONMENT_ID)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(signingKey);

  await assert.rejects(
    () => verifyToken(stale, config),
    (err: unknown) => err instanceof AuthError && err.code === "invalid_token",
  );
});

test("a token issued for a different deployment is refused", async () => {
  const wrongAudience = await signedToken({ wallet_address: OWNER }, { audience: "someone-elses-env" });
  await assert.rejects(
    () => verifyToken(wrongAudience, config),
    (err: unknown) => err instanceof AuthError && err.code === "invalid_token",
  );
});

test("an unsigned token is refused", async () => {
  // alg: none, the classic. jose refuses it outright.
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ wallet_address: OWNER })).toString("base64url");
  await assert.rejects(
    () => verifyToken(`${header}.${body}.`, config),
    (err: unknown) => err instanceof AuthError && err.code === "invalid_token",
  );
});

test("garbage is refused rather than crashing the route", async () => {
  for (const token of ["", "not-a-token", "a.b.c"]) {
    await assert.rejects(
      () => verifyToken(token, config),
      (err: unknown) => err instanceof AuthError,
      `"${token}" should be refused`,
    );
  }
});

// ----------------------------------------------- no sign-in means no action

test("a request with no token has no session", async () => {
  assert.equal(await readSession(requestWith({}), config), null);
});

test("a state-changing route refuses a request with no sign-in", async () => {
  await assert.rejects(
    () => requireSession(requestWith({}), config),
    (err: unknown) =>
      err instanceof AuthError && err.code === "not_signed_in" && err.status === 401,
  );
});

test("a bearer token is read out of the header, however it is cased", () => {
  assert.equal(bearerToken(new Headers({ authorization: "Bearer abc" })), "abc");
  assert.equal(bearerToken(new Headers({ Authorization: "bearer  abc  " })), "abc");
  assert.equal(bearerToken(new Headers({ authorization: "Basic abc" })), null);
  assert.equal(bearerToken(new Headers({})), null);
});

test("a signed-in request resolves to its own verified account", async () => {
  const token = await signedToken({ wallet_address: OWNER });
  const session = await requireSession(
    requestWith({ authorization: `Bearer ${token}` }),
    config,
  );
  assert.equal(session.walletAddress, OWNER);
});

// --------------------------------------------------------- ownership

test("the owner may act on their own account", async () => {
  const session = await verifyToken(await signedToken({ wallet_address: OWNER }), config);
  assert.equal(assertOwns(session, OWNER), OWNER);
  // Case is irrelevant: both sides are checksummed before comparison.
  assert.equal(assertOwns(session, OWNER.toLowerCase()), OWNER);
});

test("nobody may act on an account that is not theirs", async () => {
  const session = await verifyToken(await signedToken({ wallet_address: OWNER }), config);
  assert.throws(
    () => assertOwns(session, SOMEONE_ELSE),
    (err: unknown) =>
      err instanceof AuthError && err.code === "not_your_account" && err.status === 403,
  );
});

test("a malformed account address is a bad request, not a 403", async () => {
  const session = await verifyToken(await signedToken({ wallet_address: OWNER }), config);
  assert.throws(
    () => assertOwns(session, "0xnot-an-address"),
    (err: unknown) => err instanceof AuthError && err.code === "bad_address" && err.status === 400,
  );
});

test("a wallet address in a request body is not a credential", () => {
  // walletFromClaims only ever reads VERIFIED claims. There is no code path that turns a body
  // field into a session, which is the whole point of the package.
  assert.equal(walletFromClaims({ owner: OWNER } as Record<string, unknown>), null);
  assert.equal(walletFromClaims({ wallet_address: "0xnope" }), null);
  assert.equal(walletFromClaims({ wallet_address: OWNER }), OWNER);
});

// ------------------------------------------------------- the development path

test("the development bypass is honoured only when it is switched on", async () => {
  const off: AuthConfig = { ...config, allowDevAuth: false };
  assert.equal(await readSession(requestWith({ "x-modalis-dev-wallet": OWNER }), off), null);

  const on: AuthConfig = { ...config, allowDevAuth: true };
  const session = await readSession(requestWith({ "x-modalis-dev-wallet": OWNER }), on);
  assert.equal(session?.walletAddress, OWNER);
  assert.equal(session?.via, "dev");
});

test("the development bypass cannot be switched on for the live network", () => {
  const mainnet = authConfigFromEnv({
    MODALIS_DEV_AUTH: "true",
    NEXT_PUBLIC_MONAD_CHAIN_ID: "143",
    NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: ENVIRONMENT_ID,
  });
  assert.equal(mainnet.allowDevAuth, false);

  const testnet = authConfigFromEnv({
    MODALIS_DEV_AUTH: "true",
    NEXT_PUBLIC_MONAD_CHAIN_ID: "10143",
    NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: ENVIRONMENT_ID,
  });
  assert.equal(testnet.allowDevAuth, true);
});

test("an invalid development wallet is ignored rather than trusted", async () => {
  const on: AuthConfig = { ...config, allowDevAuth: true };
  assert.equal(await readSession(requestWith({ "x-modalis-dev-wallet": "0xnope" }), on), null);
});

// ----------------------------------------------------------- configuration

test("a server with no sign-in configured refuses tokens outright", async () => {
  const unconfigured: AuthConfig = { ...config, jwksUrl: undefined };
  assert.equal(isAuthConfigured(unconfigured), false);
  await assert.rejects(
    () => verifyToken("anything", unconfigured),
    (err: unknown) =>
      err instanceof AuthError && err.code === "auth_not_configured" && err.status === 503,
  );
});

test("the signing-key location is derived from the deployment's own id", () => {
  const derived = authConfigFromEnv({ NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: "abc-123" });
  assert.equal(derived.jwksUrl, "https://app.dynamic.xyz/api/v0/sdk/abc-123/.well-known/jwks");
  assert.equal(derived.environmentId, "abc-123");
  assert.equal(isAuthConfigured(derived), true);

  const explicit = authConfigFromEnv({
    DYNAMIC_JWKS_URL: "https://example.test/jwks",
    NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: "abc-123",
  });
  assert.equal(explicit.jwksUrl, "https://example.test/jwks");

  assert.equal(authConfigFromEnv({}).jwksUrl, undefined);
});

test("peeking at a token is never an access decision", async () => {
  const forged = await signedToken({ wallet_address: OWNER }, { key: attackerKey });
  // It decodes — which is exactly why it must not be used to decide anything.
  assert.equal(peekToken(forged)?.wallet_address, OWNER);
  assert.equal(peekToken("rubbish"), null);
  // ...and the verifying path still refuses it.
  await assert.rejects(() => verifyToken(forged, config), (err: unknown) => err instanceof AuthError);
});
