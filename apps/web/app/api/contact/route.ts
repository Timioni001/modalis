/**
 * /api/contact — a message to the people who build Modalis.
 *
 * Signed-in only: the sender is the verified wallet, so a reply has somewhere to go and the form
 * can't be used to flood the inbox anonymously. Stored in Supabase, readable only by the service
 * role, and deleted with the rest of the person's data if they delete their account.
 */
import { serverClient } from "@modalis/db";
import { DomainError } from "@modalis/domain";
import { jsonResponse, rateLimit, readBody, requireOwner, route } from "@/lib/api";
import { text } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const wallet = await requireOwner(request);
    await rateLimit(request, "contact", { max: 5, windowMs: 60 * 60 * 1000 });
    const body = await readBody(request);
    const message = text(body.message, "your message", { max: 2000, required: true })!;
    const email = text(body.email, "your email", { max: 200 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new DomainError("invalid_email", "That email address doesn't look right.", 400);
    }

    const db = serverClient();
    if (!db) {
      throw new DomainError(
        "contact_unavailable",
        "Messages can't be saved on this deployment. Please open an issue on the repository instead.",
        503,
      );
    }
    const { error } = await db
      .from("contact_messages")
      .insert({ wallet_address: wallet.toLowerCase(), email: email ?? null, message });
    if (error) throw error;
    return jsonResponse({ sent: true });
  });
}
