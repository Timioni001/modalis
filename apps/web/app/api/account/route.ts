/**
 * /api/account — your data, yours to take or delete.
 *
 * GET    downloads everything Modalis's database holds about the signed-in wallet, as JSON.
 * DELETE removes it all: the user row (every other table cascades from it) and contact messages.
 *
 * Neither touches the chain. Money in the vault and the public record of signed transactions are
 * not Modalis's to hand over or erase; withdrawing stays in the person's own hands.
 */
import { findUserByWallet, serverClient } from "@modalis/db";
import { DomainError } from "@modalis/domain";
import { jsonResponse, rateLimit, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Every table that holds rows keyed to a user. */
const USER_TABLES = [
  "goals",
  "interview_sessions",
  "mandates",
  "transactions",
  "scenarios",
  "domain_events",
  "notifications",
  "automation_settings",
] as const;

function requireDb() {
  const db = serverClient();
  if (!db) throw new DomainError("no_database", "This deployment doesn't store any personal data.", 404);
  return db;
}

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const wallet = await requireOwner(request);
    await rateLimit(request, "account.export", { max: 10, windowMs: 60 * 60 * 1000 });
    const db = requireDb();
    const user = await findUserByWallet(db, wallet);
    const tables: Record<string, unknown[]> = {};
    if (user) {
      for (const table of USER_TABLES) {
        const { data, error } = await db.from(table).select().eq("user_id", user.id);
        if (error) throw error;
        tables[table] = data ?? [];
      }
    }
    const { data: messages, error } = await db
      .from("contact_messages")
      .select()
      .eq("wallet_address", wallet.toLowerCase());
    if (error) throw error;
    tables.contact_messages = messages ?? [];

    return jsonResponse({
      exportedAt: new Date().toISOString(),
      wallet,
      note: "Everything Modalis's database holds about this wallet. Your balances and transactions are on Monad, which is public and not part of this file.",
      user,
      ...tables,
    });
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return route(async () => {
    const wallet = await requireOwner(request);
    await rateLimit(request, "account.delete", { max: 3, windowMs: 60 * 60 * 1000 });
    const db = requireDb();
    const lower = wallet.toLowerCase();
    const { error: msgError } = await db.from("contact_messages").delete().eq("wallet_address", lower);
    if (msgError) throw msgError;
    const { error } = await db.from("users").delete().eq("wallet_address", lower);
    if (error) throw error;
    return jsonResponse({ deleted: true });
  });
}
