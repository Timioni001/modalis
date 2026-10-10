/**
 * Error tracking, opt-in: with SENTRY_DSN set, unhandled server errors are sent to Sentry.
 *
 * No SDK. One fetch to Sentry's envelope endpoint keeps the bundle and the dependency list
 * unchanged, and every message and stack goes through the same scrubber as the logs first, so an
 * RPC URL's API key or a token never leaves the server. Without SENTRY_DSN this does nothing.
 */
import { randomUUID } from "node:crypto";
import { scrub } from "./observe.ts";

type Dsn = { endpoint: string; key: string };

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn.trim());
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!u.username || !project) return null;
    return { endpoint: `${u.protocol}//${u.host}/api/${project}/envelope/`, key: u.username };
  } catch {
    return null;
  }
}

export function sentryEnvelope(err: unknown, tags: Record<string, string>, now = new Date()): string {
  const e = err instanceof Error ? err : new Error(String(err));
  const eventId = randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tags,
    exception: { values: [{ type: e.name, value: scrub(e.message) }] },
    extra: { stack: scrub(e.stack ?? "") },
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

/** Fire and forget: reporting must never slow down or break the response. */
export function reportError(err: unknown, tags: Record<string, string> = {}): void {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  void fetch(dsn.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-sentry-envelope",
      "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=modalis/1.0`,
    },
    body: sentryEnvelope(err, tags),
  }).catch(() => undefined);
}
