import { serverClient } from "@modalis/db";
import { DomainError } from "@modalis/domain";
import { jsonResponse, rateLimit, readBody, route } from "@/lib/api";
import { text } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Public early-access signup. It stores only a validated email through the server role. */
export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "waitlist", { max: 3, windowMs: 60 * 60 * 1000 });
    const body = await readBody(request);
    const email = text(body.email, "your email", { max: 200, required: true })!.toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new DomainError("invalid_email", "That email address doesn't look right.", 400);
    }
    const db = serverClient();
    if (!db) {
      throw new DomainError(
        "waitlist_unavailable",
        "The early-access list is not open on this deployment yet.",
        503,
      );
    }
    const { error } = await db
      .from("waitlist_signups")
      .upsert({ email, source: "landing" }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw error;
    return jsonResponse({ joined: true });
  });
}
