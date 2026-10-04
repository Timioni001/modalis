/**
 * JSON serialisation for API responses.
 *
 * Money and token amounts are bigint, which JSON.stringify cannot represent. Every bigint crosses
 * the wire as a decimal STRING and is parsed back to bigint on the other side — never through
 * Number, which would silently lose precision above 2^53.
 */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function toJson<T>(value: T): Json {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  ) as Json;
}

export function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return Response.json(toJson(value), init);
}

export function errorResponse(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
