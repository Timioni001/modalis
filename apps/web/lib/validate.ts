/**
 * Request validation.
 *
 * Server-side validation is the only validation that counts. The browser's checks exist to give
 * someone a fast answer; these exist to stop a malformed or hostile request reaching the chain,
 * the database or the AI layer.
 *
 * Deliberately a hundred lines rather than a schema library. The surface is small, the rules are
 * financial and specific ("a dollar amount, at most two decimal places, under a sane ceiling"),
 * and the error messages have to be sentences a person can act on. A generic validator would give
 * us `"body.amount: expected string, received number"`, which is not something anyone can fix.
 */
import { DomainError } from "@modalis/domain";

/** A validation failure reads as a sentence, and never echoes the input back into the page. */
export class InvalidRequest extends DomainError {
  constructor(message: string) {
    super("invalid_request", message, 400);
  }
}

/** Parses a JSON body, treating anything unparseable as an empty object rather than a crash. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (type && !type.includes("application/json")) {
    throw new InvalidRequest("We couldn't read that request.");
  }
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InvalidRequest("We couldn't read that request.");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof InvalidRequest) throw err;
    throw new InvalidRequest("We couldn't read that request.");
  }
}

/**
 * A dollar amount as a decimal string.
 *
 * Money never arrives as a JavaScript number: above 2^53 a number loses cents silently, and
 * `0.1 + 0.2` is the reason finance uses decimal strings. A number is accepted here only to give
 * a clearer error than "invalid".
 */
export function money(value: unknown, field: string, opts: { max?: number } = {}): string {
  if (typeof value === "number") {
    throw new InvalidRequest(`Enter ${field} as an amount, like 500 or 500.00.`);
  }
  if (typeof value !== "string") throw new InvalidRequest(`We need ${field}.`);
  const text = value.trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) {
    throw new InvalidRequest(`Enter ${field} as an amount, like 500 or 500.00.`);
  }
  if (Number(text) <= 0) throw new InvalidRequest(`${capitalise(field)} has to be more than zero.`);
  const max = opts.max ?? 100_000_000;
  if (Number(text) > max) {
    throw new InvalidRequest(`${capitalise(field)} is larger than this deployment supports.`);
  }
  return text;
}

/** A whole number inside a range. */
export function integer(
  value: unknown,
  field: string,
  opts: { min: number; max: number } = { min: 0, max: Number.MAX_SAFE_INTEGER },
): number {
  const n = typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new InvalidRequest(`We need ${field} as a whole number.`);
  }
  if (n < opts.min || n > opts.max) {
    throw new InvalidRequest(`${capitalise(field)} has to be between ${opts.min} and ${opts.max}.`);
  }
  return n;
}

/** One of a fixed set. The set is small enough to name in the error. */
export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new InvalidRequest(`${capitalise(field)} has to be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

/** Free text a person typed. Bounded, trimmed, and never required to be present. */
export function text(
  value: unknown,
  field: string,
  opts: { max: number; required?: boolean } = { max: 500 },
): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (opts.required) throw new InvalidRequest(`We need ${field}.`);
    return undefined;
  }
  if (typeof value !== "string") throw new InvalidRequest(`We need ${field} as text.`);
  const trimmed = value.trim();
  if (trimmed.length > opts.max) {
    throw new InvalidRequest(`${capitalise(field)} is too long — keep it under ${opts.max} characters.`);
  }
  // Control characters have no business in text a person typed, and they are how a log line or a
  // prompt gets forged.
  // eslint-disable-next-line no-control-regex
  return trimmed.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** A transaction reference. Checked by shape here; checked against the chain before it is believed. */
export function receiptReference(value: unknown, field = "receipt"): `0x${string}` {
  // The prefix is matched case-insensitively because the value is normalised on the way out
  // anyway, and a reference that only differs in case is the same transaction.
  if (typeof value !== "string" || !/^0[xX][0-9a-fA-F]{64}$/.test(value)) {
    throw new InvalidRequest(`That isn't a valid ${field}.`);
  }
  return value.toLowerCase() as `0x${string}`;
}

/**
 * An idempotency key supplied by the browser.
 *
 * Opaque to the server: it only ever has to be comparable and bounded. A caller that omits one
 * gets no replay protection, which is why the routes that move money require it.
 */
export function idempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw new InvalidRequest("That request was missing its one-time key. Try again.");
  }
  return value;
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
