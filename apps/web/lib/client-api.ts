"use client";

/**
 * Browser-side API access.
 *
 * Every call carries the Dynamic session token, which is how the server knows who is asking.
 * Before this existed the browser told the server which account to act on, and the server
 * believed it. Now the account is whatever the signed token proves, and nothing in the request
 * body can change that.
 *
 * `getAuthToken()` returns Dynamic's JWT for the signed-in user, or undefined when nobody is
 * signed in — in which case protected calls fail with a clear message rather than acting
 * anonymously.
 */
import { getAuthToken } from "@dynamic-labs/sdk-react-core";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  try {
    const token = getAuthToken();
    if (token) headers.authorization = `Bearer ${token}`;
  } catch {
    // Not signed in, or Dynamic is not configured. Protected routes will say so.
  }
  // Local development without Dynamic: the server only honours this when MODALIS_DEV_AUTH is on
  // and it is never accepted on the live network.
  const devWallet = process.env.NEXT_PUBLIC_DEV_WALLET;
  if (devWallet) headers["x-modalis-dev-wallet"] = devWallet;
  return headers;
}

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      (body as { error?: string }).error ?? "Something went wrong.",
      response.status,
      (body as { code?: string }).code,
    );
  }
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return parse<T>(await fetch(path, { headers: await authHeaders() }));
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return parse<T>(
    await fetch(path, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(body ?? {}),
    }),
  );
}

/**
 * A one-time key for a request that moves money.
 *
 * Generated once per attempt and reused across retries of THAT attempt, so a dropped connection
 * or a double tap replays the first answer instead of doing the work twice. A new attempt — the
 * person pressing the button again after seeing a failure — gets a new key, because that is a new
 * intent rather than a repeat.
 */
export function requestKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Posts a money-moving request under a one-time key.
 *
 * Retries only what is safe to retry: a network failure or a 5xx, where the request may never
 * have been seen. A refusal (4xx) is the server's considered answer and is returned as-is.
 */
export async function apiPostOnce<T>(
  path: string,
  body: Record<string, unknown> = {},
  opts: { key?: string; retries?: number } = {},
): Promise<T> {
  const key = opts.key ?? requestKey();
  const retries = opts.retries ?? 1;

  for (let attempt = 0; ; attempt++) {
    try {
      return await apiPost<T>(path, { ...body, requestKey: key });
    } catch (err) {
      const retryable =
        !(err instanceof ApiError) || (err.status >= 500 && err.status !== 501);
      if (!retryable || attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
}
