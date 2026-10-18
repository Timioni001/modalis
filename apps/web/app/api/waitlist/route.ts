import { serverClient } from "@modalis/db";
import { DomainError } from "@modalis/domain";
import { jsonResponse, rateLimit, readBody, route } from "@/lib/api";
import { text } from "@/lib/validate";

export const dynamic = "force-dynamic";

function isMissingWaitlistTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code.toUpperCase() : "";
  const text = [candidate.code, candidate.message, candidate.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  // Postgres uses 42P01; PostgREST uses PGRST205 when the table is absent from
  // its schema cache. Both mean the migration has not reached this project yet.
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (/waitlist_signups/.test(text) &&
      (text.includes("schema cache") ||
        text.includes("does not exist") ||
        text.includes("could not find the table") ||
        text.includes("relation")))
  );
}

function errorDetails(error: unknown): { code: string; text: string } {
  if (!error || typeof error !== "object") return { code: "", text: "" };
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code.toUpperCase() : "";
  const text = [candidate.code, candidate.message, candidate.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return { code, text };
}

function waitlistStorageError(error: unknown): DomainError {
  const { code, text } = errorDetails(error);
  if (
    code === "PGRST204" ||
    code === "42703" ||
    code === "42P10" ||
    text.includes("schema cache") ||
    text.includes("column") ||
    text.includes("on conflict")
  ) {
    return new DomainError(
      "waitlist_unavailable",
      "The early-access list schema is incomplete. Re-run the waitlist migration in the Supabase project used by this deployment.",
      503,
    );
  }
  if (
    code === "401" ||
    code === "42501" ||
    code === "PGRST301" ||
    text.includes("permission denied") ||
    text.includes("row-level security") ||
    text.includes("not authorized") ||
    text.includes("invalid api key")
  ) {
    return new DomainError(
      "waitlist_unavailable",
      "The early-access list is not writable on this deployment. Check its Production Supabase service-role key.",
      503,
    );
  }
  return new DomainError(
    "waitlist_unavailable",
    "The early-access list is temporarily unavailable. Please try again shortly.",
    503,
  );
}

async function addResendContact(email: string, apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, unsubscribed: false }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new DomainError(
      "waitlist_unavailable",
      "The early-access list is temporarily unavailable. Please try again shortly.",
      503,
    );
  }

  const responseText = await response.text().catch(() => "");
  // Resend treats an existing contact as a conflict. Duplicate signup is still successful.
  if (response.ok || response.status === 409 || /already exists|already been added/i.test(responseText)) {
    return;
  }
  if (response.status === 401 || response.status === 403) {
    throw new DomainError(
      "waitlist_unavailable",
      "The early-access email provider is not configured correctly on this deployment.",
      503,
    );
  }
  throw new DomainError(
    "waitlist_unavailable",
    "The early-access list is temporarily unavailable. Please try again shortly.",
    503,
  );
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
    const provider = process.env.WAITLIST_PROVIDER?.trim().toLowerCase();
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (provider === "resend" || (!provider && resendKey)) {
      if (!resendKey) {
        throw new DomainError(
          "waitlist_unavailable",
          "The early-access email provider is not configured on this deployment yet.",
          503,
        );
      }
      await addResendContact(email, resendKey);
      return jsonResponse({ joined: true, provider: "resend" });
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
      throw waitlistStorageError(error);
    }
    return jsonResponse({ joined: true });
  });
}
