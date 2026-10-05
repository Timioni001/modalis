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
