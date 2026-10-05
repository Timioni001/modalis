/**
 * Replay protection and rate limiting for the routes that cost something.
 *
 * Two different problems, both solved in memory per server instance, and both honest about that:
 *
 *  - **Idempotency.** A person taps "Add money" twice, or their connection drops and the browser
 *    retries. Without a key, the second request does the work again. The chain protects the
 *    *money* — a nonce stops a proposal executing twice, and a deposit is signed by the person
 *    each time — but it does not stop a duplicate database row, a duplicate gas spend by the
 *    manager key, or a confusing duplicate in someone's activity.
 *
 *  - **Rate limiting.** `/api/plan/draft` runs the planner and may call the AI layer.
 *    `/api/adjustment/execute` spends the manager key's gas. Neither should be callable in a loop.
 *
 * In-memory means: per instance, and lost on restart. For a single deployment that is the honest
 * level of protection, and it is a real improvement over none. It is NOT a distributed limiter,
 * and the comment says so rather than implying otherwise. The chain and the contract remain the
 * actual guarantees; this layer stops waste and confusion, not theft.
 */
import { DomainError } from "@modalis/domain";

type Entry<T> = { value: T; expiresAt: number };

/**
 * A bounded map that forgets. Without the cap, a hostile caller is a memory leak.
 *
 * Plain fields rather than constructor parameter properties: this repository runs TypeScript
 * directly through Node's type stripping, which does not support them.
 */
class ExpiringMap<T> {
  private readonly items = new Map<string, Entry<T>>();
  private readonly max: number;

  constructor(max = 5_000) {
    this.max = max;
  }

  get(key: string): T | undefined {
    const entry = this.items.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.items.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.items.size >= this.max) this.evict();
    this.items.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }

  /** Drop everything expired; if that frees nothing, drop the oldest tenth. */
  private evict(): void {
    const now = Date.now();
    let freed = 0;
    for (const [key, entry] of this.items) {
      if (entry.expiresAt <= now) {
        this.items.delete(key);
        freed++;
      }
    }
    if (freed > 0) return;
    const drop = Math.ceil(this.max / 10);
    let i = 0;
    for (const key of this.items.keys()) {
      this.items.delete(key);
      if (++i >= drop) break;
    }
  }
}

// ------------------------------------------------------------------ idempotency

type InFlight = { state: "in_flight" };
type Settled = { state: "settled"; body: string; status: number };

const results = new ExpiringMap<InFlight | Settled>(5_000);
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export class DuplicateRequest extends DomainError {
  constructor(message: string) {
    super("duplicate_request", message, 409);
  }
}

/**
 * Runs `work` at most once for a given (account, operation, key).
 *
 * A repeat of a *settled* request replays the original response, so a retried tap shows the same
 * receipt rather than making a second one. A repeat of an *in-flight* request is refused, because
 * returning "ok" for something still happening is how a person ends up believing money moved
 * twice.
 */
export async function once(
  owner: string,
  operation: string,
  key: string,
  work: () => Promise<Response>,
): Promise<Response> {
  const id = `${owner.toLowerCase()}:${operation}:${key}`;
  const existing = results.get(id);

  if (existing?.state === "in_flight") {
    throw new DuplicateRequest(
      "That request is still going through. Give it a moment rather than trying again.",
    );
  }
  if (existing?.state === "settled") {
    return new Response(existing.body, {
      status: existing.status,
      headers: { "content-type": "application/json", "x-modalis-replayed": "1" },
    });
  }

  results.set(id, { state: "in_flight" }, IDEMPOTENCY_TTL_MS);
  try {
    const response = await work();
    // Only a successful outcome is worth replaying. A failure should be retryable immediately,
    // because the thing that failed may well have been transient.
    if (response.ok) {
      const body = await response.clone().text();
      results.set(id, { state: "settled", body, status: response.status }, IDEMPOTENCY_TTL_MS);
    } else {
      results.delete(id);
    }
    return response;
  } catch (err) {
    results.delete(id);
    throw err;
  }
}

// ----------------------------------------------------------------- rate limiting

const buckets = new ExpiringMap<{ count: number; resetAt: number }>(10_000);

export class TooManyRequests extends DomainError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(
      "too_many_requests",
      `That's a lot of requests at once. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.`,
      429,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * A fixed window per (identity, operation).
 *
 * Fixed window rather than a sliding log: it is one counter per key instead of a growing array,
 * and at these limits the edge-of-window burst a fixed window permits is not a problem worth
 * paying for.
 */
export function limit(
  identity: string,
  operation: string,
  opts: { max: number; windowMs: number },
): void {
  const id = `${identity.toLowerCase()}:${operation}`;
  const now = Date.now();
  const bucket = buckets.get(id);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + opts.windowMs }, opts.windowMs);
    return;
  }
  if (bucket.count >= opts.max) {
    throw new TooManyRequests(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
  }
  bucket.count += 1;
}

/**
 * Who to count against when nobody is signed in.
 *
 * Behind a proxy the socket address is the proxy, so the forwarded header is the only signal
 * available — and it is caller-controlled, so only the first entry is used and the result is
 * treated as a hint for limiting, never as identity. Identity comes from a verified session.
 */
export function callerHint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64) || "anonymous";
  return request.headers.get("x-real-ip")?.slice(0, 64) || "anonymous";
}

/** Test seam: the maps are process-global, so a test that fills one has to be able to clear it. */
export function resetGuards(): void {
  results.clear();
  buckets.clear();
}
