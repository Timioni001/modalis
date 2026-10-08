/**
 * Domain events, notifications and automation settings (0002).
 *
 * All three are server-written only — RLS gives the browser read access to its own rows and
 * nothing more — and every query here filters on user_id because the service role bypasses RLS.
 */
import type { ModalisClient } from "../client.ts";
import { tolerate } from "../errors.ts";
import type {
  AutomationLevel,
  AutomationSettingsRow,
  DomainEventRow,
  DomainEventType,
  Json,
  NotificationKind,
  NotificationRow,
} from "../types.generated.ts";

export type EventInput = {
  userId: string;
  type: DomainEventType;
  goalId?: string | null;
  payload?: Json;
  /** When the event is a transaction, its hash. Recording the same one twice is a no-op. */
  txHash?: string | null;
};

/**
 * Appends an event. A transaction-backed event is idempotent on (user, type, tx): a retried
 * request, or the same receipt reported twice, returns the event that already exists.
 */
export async function recordEvent(db: ModalisClient, input: EventInput): Promise<DomainEventRow | null> {
  return tolerate("recordEvent", async () => {
    const tx = input.txHash ? input.txHash.toLowerCase() : null;
    if (tx) {
      const { data: existing } = await db
        .from("domain_events")
        .select()
        .eq("user_id", input.userId)
        .eq("type", input.type)
        .eq("tx_hash", tx)
        .maybeSingle();
      if (existing) return existing;
    }
    const { data, error } = await db
      .from("domain_events")
      .insert({
        user_id: input.userId,
        type: input.type,
        goal_id: input.goalId ?? null,
        payload: input.payload ?? {},
        tx_hash: tx,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export async function recentEvents(db: ModalisClient, userId: string, limit = 50): Promise<DomainEventRow[]> {
  const rows = await tolerate("recentEvents", async () => {
    const { data, error } = await db
      .from("domain_events")
      .select()
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));
    if (error) throw error;
    return data ?? [];
  });
  return rows ?? [];
}

export type NotificationInput = {
  userId: string;
  eventId?: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
};

/** One notification per event at most — the unique index makes a replay a no-op. */
export async function createNotification(
  db: ModalisClient,
  input: NotificationInput,
): Promise<NotificationRow | null> {
  return tolerate("createNotification", async () => {
    if (input.eventId) {
      const { data: existing } = await db
        .from("notifications")
        .select()
        .eq("user_id", input.userId)
        .eq("event_id", input.eventId)
        .maybeSingle();
      if (existing) return existing;
    }
    const { data, error } = await db
      .from("notifications")
      .insert({
        user_id: input.userId,
        event_id: input.eventId ?? null,
        kind: input.kind,
        title: input.title.slice(0, 120),
        body: input.body.slice(0, 600),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export async function listNotifications(db: ModalisClient, userId: string, limit = 30): Promise<NotificationRow[]> {
  const rows = await tolerate("listNotifications", async () => {
    const { data, error } = await db
      .from("notifications")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error) throw error;
    return data ?? [];
  });
  return rows ?? [];
}

/** Marks read only the person's own notifications; another person's id simply matches nothing. */
export async function markNotificationsRead(db: ModalisClient, userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const n = await tolerate("markNotificationsRead", async () => {
    const { data, error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", ids.slice(0, 100))
      .is("read_at", null)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  });
  return n ?? 0;
}

export async function getAutomation(db: ModalisClient, userId: string): Promise<AutomationSettingsRow | null> {
  return tolerate("getAutomation", async () => {
    const { data, error } = await db
      .from("automation_settings")
      .select()
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });
}

export async function saveAutomation(
  db: ModalisClient,
  userId: string,
  row: { level: AutomationLevel; requestedLevel: AutomationLevel | null; effectiveAt: string | null },
): Promise<AutomationSettingsRow | null> {
  return tolerate("saveAutomation", async () => {
    const { data, error } = await db
      .from("automation_settings")
      .upsert(
        {
          user_id: userId,
          level: row.level,
          requested_level: row.requestedLevel,
          effective_at: row.effectiveAt,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

/** Every user whose automation has a pending change — for the monitor to apply when due. */
export async function automatedUsers(db: ModalisClient): Promise<AutomationSettingsRow[]> {
  const rows = await tolerate("automatedUsers", async () => {
    const { data, error } = await db
      .from("automation_settings")
      .select()
      .or("level.eq.automated,requested_level.eq.automated");
    if (error) throw error;
    return data ?? [];
  });
  return rows ?? [];
}

/**
 * Wallet addresses of everyone who has chosen (or asked for) automatic changes — the monitor's
 * watch list when no explicit one is configured. Two plain queries rather than a join, so the
 * typed client needs no relationship metadata.
 */
export async function automationWallets(db: ModalisClient): Promise<{ userId: string; wallet: string }[]> {
  const rows = await automatedUsers(db);
  if (rows.length === 0) return [];
  const users = await tolerate("automationWallets", async () => {
    const { data, error } = await db.from("users").select("id, wallet_address").in("id", rows.map((r) => r.user_id));
    if (error) throw error;
    return data ?? [];
  });
  return (users ?? []).map((u) => ({ userId: u.id, wallet: u.wallet_address }));
}
