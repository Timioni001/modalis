/**
 * Observability (§49): structured logs and counters, with secrets scrubbed before anything is
 * written.
 *
 * What is tracked: API failures by code, response time, sign-in and permission refusals, rate
 * limits, policy refusals (the person's rules refusing a change), transaction failures, and stale
 * prices. What is never written: private keys, sign-in tokens, API keys, secrets — scrubbed both
 * by field NAME and by the SHAPE of the value, because the dangerous leaks are the ones nobody
 * labelled. The motivating case: viem puts the RPC URL in its error messages, and an Alchemy URL
 * carries the API key in its path.
 *
 * Counters are per server instance and reset on deploy. They exist to answer "is something
 * failing right now?", not to be an analytics store.
 */

const SECRET_KEY = /(secret|password|passwd|private|priv_?key|api_?key|access_?key|authorization|cookie|token|signature|seed|mnemonic)/i;

const VALUE_RULES: [RegExp, string][] = [
  // Bearer tokens and JWTs
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted-jwt]"],
  // API keys carried in RPC URLs: alchemy /v2/<key>, infura /v3/<key>, and ?key= / ?apikey= params
  [/(\/v[23]\/)[A-Za-z0-9_-]{16,}/g, "$1[redacted]"],
  [/([?&](?:api_?key|key|token|access_token)=)[^&\s"']+/gi, "$1[redacted]"],
  // Credentials in a URL: scheme://user:pass@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[redacted]@"],
  // A labelled private key in free text
  [/((?:private[\s_-]?key|secret)\s*[:=]\s*)(0x)?[0-9a-f]{64}/gi, "$1[redacted]"],
  // Supabase service-role / anon keys are JWTs (covered above); sb_ secret keys:
  [/\bsb_secret_[A-Za-z0-9_-]+/g, "[redacted]"],
];

export function scrub(text: string): string {
  let out = text;
  for (const [re, rep] of VALUE_RULES) out = out.replace(re, rep);
  return out;
}

/** Deep-copies a value with secrets removed by key name and by value shape. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[too deep]";
  if (typeof value === "string") return scrub(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: scrub(value.message) };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = "info" | "warn" | "error";

/** One JSON line per event, scrubbed. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(redact(fields) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// --------------------------------------------------------------------- counters

export type Counter =
  | "api.requests"
  | "api.errors.server"
  | "api.errors.client"
  | "security.unauthenticated"
  | "security.forbidden"
  | "security.rate_limited"
  | "policy.refused"
  | "tx.failed"
  | "oracle.stale"
  | "faucet.sent"
  | "faucet.failed";

const counters = new Map<string, number>();
const latencies: number[] = [];

export function count(name: Counter, by = 1, label?: string): void {
  const key = label ? `${name}{${label}}` : name;
  counters.set(key, (counters.get(key) ?? 0) + by);
}

export function timing(ms: number): void {
  latencies.push(ms);
  if (latencies.length > 2_000) latencies.splice(0, latencies.length - 2_000);
}

function pctl(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export function snapshot(): { counters: Record<string, number>; latencyMs: { p50: number; p95: number; p99: number; samples: number } } {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    counters: Object.fromEntries([...counters.entries()].sort()),
    latencyMs: { p50: pctl(sorted, 50), p95: pctl(sorted, 95), p99: pctl(sorted, 99), samples: sorted.length },
  };
}

export function resetObservability(): void {
  counters.clear();
  latencies.length = 0;
}
