/**
 * Supabase clients.
 *
 * Two clients with deliberately different authority, mirroring the authority split in the
 * contracts:
 *
 *   serverClient()   service role. BYPASSES row-level security. Server only. Writes every
 *                    financial row (mandates, proposals, transactions, risk events), because
 *                    those mirror on-chain truth and a browser must never be able to forge one.
 *   browserClient()  anon key. SUBJECT to row-level security, so a user can only ever read their
 *                    own rows and write their own goals and interview answers.
 *
 * The service role key is as powerful as the database. It must never reach the browser, which is
 * why it is read from a non-NEXT_PUBLIC variable and this module throws if someone tries to build
 * a service client in a browser context.
 *
 * Everything degrades: with Supabase unconfigured both return null and the repositories become
 * no-ops. The product works chain-only, and persistence is additive rather than required.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.generated.ts";

export type ModalisClient = SupabaseClient<Database>;

export type DbConfig = {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
};

export function dbConfigFromEnv(env: Record<string, string | undefined> = process.env): DbConfig {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
  };
}

/** True when the server can write. The app checks this before claiming anything is persisted. */
export function isServerDbConfigured(cfg: DbConfig = dbConfigFromEnv()): boolean {
  return Boolean(cfg.url && cfg.serviceRoleKey);
}

export function isBrowserDbConfigured(cfg: DbConfig = dbConfigFromEnv()): boolean {
  return Boolean(cfg.url && cfg.anonKey);
}

let cachedServer: ModalisClient | null | undefined;

/**
 * Service-role client. Returns null when unconfigured rather than throwing, so callers can treat
 * persistence as optional.
 */
export function serverClient(cfg: DbConfig = dbConfigFromEnv()): ModalisClient | null {
  if (cachedServer !== undefined) return cachedServer;

  if (typeof window !== "undefined") {
    throw new Error(
      "serverClient() was called in a browser context. The Supabase service role key bypasses " +
        "row-level security and must never be shipped to a client.",
    );
  }
  if (!cfg.url || !cfg.serviceRoleKey) {
    cachedServer = null;
    return null;
  }

  cachedServer = createClient<Database>(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-modalis-role": "service" } },
  });
  return cachedServer;
}

/**
 * Anon client for the browser, authenticated as the user.
 *
 * `accessToken` is the Dynamic JWT. Supabase verifies it as a third-party provider and the RLS
 * policies read its `wallet_address` claim, so this client can only reach that user's rows.
 */
export function browserClient(
  accessToken?: string,
  cfg: DbConfig = dbConfigFromEnv(),
): ModalisClient | null {
  if (!cfg.url || !cfg.anonKey) return null;

  return createClient<Database>(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

/** Test seam: drops the cached service client so a changed environment is picked up. */
export function resetClientCache(): void {
  cachedServer = undefined;
}
