import { serverClient } from "@modalis/db";
import { DomainError } from "@modalis/domain";
import { jsonResponse, rateLimit, readBody, route } from "@/lib/api";
import { text } from "@/lib/validate";

export const dynamic = "force-dynamic";

function isMissingWaitlistTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = [candidate.code, candidate.message, candidate.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return text.includes("42p01") || /relation[^\n]*waitlist_signups[^\n]*does not exist/.test(text);
}

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
    if (error) {
      if (isMissingWaitlistTable(error)) {
        throw new DomainError(
          "waitlist_unavailable",
          "The early-access list is being connected. Please try again shortly.",
          503,
        );
      }
      throw error;
    }
    return jsonResponse({ joined: true });
  });
}
