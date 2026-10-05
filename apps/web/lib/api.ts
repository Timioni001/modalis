/**
 * Shared plumbing for the domain API routes.
 *
 * Two jobs, and both are security-relevant:
 *
 *  1. Assemble the DomainContext once per request, so a route never reaches for environment
 *     variables itself.
 *  2. Establish WHO is asking, from a verified signature rather than from the request body.
 *
 * The rule every mutating route follows: the acting address comes from `requireOwner`, which
 * reads it from a verified session. No route takes an owner address from its input.
 */
import "server-only";
import { AuthError, assertOwns, readSession, requireSession, type Session } from "@modalis/auth";
import { serverClient } from "@modalis/db";
import { DomainError, type DomainContext } from "@modalis/domain";
import { accountFromPrivateKey } from "@modalis/chain";
import type { Address } from "viem";
import { getServerContext } from "./server";
import { errorResponse, jsonResponse } from "./serialize";
import { TooManyRequests, callerHint, limit, once } from "./guard";
import { idempotencyKey, readBody } from "./validate";

export { jsonResponse, readBody };

/** Builds the context a domain service needs for this request. */
export async function domainContext(): Promise<DomainContext> {
  const { client, deployment, rpc } = await getServerContext();
  return {
    client,
    deployment,
    db: serverClient(),
    explorerUrl: process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL || undefined,
    rpcUrl: rpc.httpUrl,
    ai: { apiKey: process.env.AI_API_KEY, model: process.env.AI_MODEL },
    managerAddress: managerAddress(),
  };
}

export function managerAddress(): Address | undefined {
  const explicit = process.env.MANAGER_ADDRESS?.trim();
  if (explicit) return explicit as Address;
  const key = process.env.MANAGER_PRIVATE_KEY;
  if (!key) return undefined;
  try {
    return accountFromPrivateKey(key).address as Address;
  } catch {
    return undefined;
  }
}

/**
 * The verified account acting on this request.
 *
 * This is the whole fix for the old hole. Previously a route read `{"owner": "0x..."}` from the
 * body and acted on it, so anyone could make the Modalis manager key act on anyone's plan. Now
 * the address comes from a signed, verified token and nothing else.
 */
export async function requireOwner(request: Request): Promise<Address> {
  const session = await requireSession(request);
  return session.walletAddress;
}

/** The session when there is one. For reads where anonymous access is acceptable. */
export async function optionalSession(request: Request): Promise<Session | null> {
  try {
    return await readSession(request);
  } catch {
    // A malformed token on a public read is not worth failing the request over.
    return null;
  }
}

/**
 * Confirms the signed-in person owns the account they named.
 *
 * Used where a route takes an address in its path for readability. The address is still only
 * honoured when it matches the verified session.
 */
export async function requireOwnerMatching(request: Request, claimed: string): Promise<Address> {
  const session = await requireSession(request);
  return assertOwns(session, claimed);
}

/**
 * Rate limits the routes that cost something, counted against the verified account when there is
 * one and against the caller hint when there is not.
 */
export async function rateLimit(
  request: Request,
  operation: string,
  opts: { max: number; windowMs: number },
): Promise<void> {
  const session = await optionalSession(request);
  limit(session?.walletAddress ?? callerHint(request), operation, opts);
}

/**
 * Runs a money-moving handler at most once per one-time key.
 *
 * The browser sends the key; a retried tap or a dropped connection replays the original response
 * instead of doing the work twice. The chain is still what protects the money — this protects the
 * person from a confusing duplicate, and the manager key from paying gas twice.
 */
export async function idempotent(
  owner: Address,
  operation: string,
  body: Record<string, unknown>,
  work: () => Promise<Response>,
): Promise<Response> {
  return once(owner, operation, idempotencyKey(body.requestKey), work);
}

/** Turns a domain or auth failure into a response a person could read. */
export function handleError(err: unknown): Response {
  if (err instanceof AuthError || err instanceof DomainError) {
    const headers: Record<string, string> =
      err instanceof TooManyRequests ? { "retry-after": String(err.retryAfterSeconds) } : {};
    return Response.json({ error: err.message, code: err.code }, { status: err.status, headers });
  }
  const message = err instanceof Error ? err.message : String(err);
  // Never leak a stack or an internal identifier to a consumer surface. The server log keeps the
  // detail; the person gets a sentence and the assurance that nothing changed.
  console.error("[modalis/api]", message);
  return errorResponse("Something went wrong on our side. Nothing was changed.", 500);
}

/** Wraps a route so every failure path is consistent. */
export async function route(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    return handleError(err);
  }
}
