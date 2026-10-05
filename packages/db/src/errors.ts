/**
 * Persistence must never break the financial flow.
 *
 * The chain is the source of truth for everything that matters. The database stores goals,
 * interview answers, explanations and caches of on-chain state — useful, but if a write fails the
 * user's mandate is still live and their funds are still theirs. So repository writes log and
 * return null rather than throwing into a request that was otherwise about to succeed.
 *
 * Reads are the same: a degraded read returns empty, and the caller falls back to the chain.
 */
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function logDbFailure(operation: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  // Deliberately not thrown: see the note above.
  console.warn(`[modalis/db] ${operation} failed, continuing without persistence: ${message}`);
}

/** Wraps a repository call so a persistence failure can never reject a request. */
export async function tolerate<T>(operation: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logDbFailure(operation, err);
    return null;
  }
}
