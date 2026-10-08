/** Reading and clearing the person's notifications (§36). Owner-scoped in every query. */
import { getAddress, type Address } from "viem";
import { findUserByWallet, listNotifications, markNotificationsRead } from "@modalis/db";
import type { DomainContext } from "../context.ts";

export type NotificationView = {
  id: string;
  kind: "info" | "attention" | "done" | "safety";
  title: string;
  body: string;
  at: string;
  read: boolean;
};

export async function getNotifications(
  ctx: DomainContext,
  owner: Address,
): Promise<{ notifications: NotificationView[]; unread: number; saved: boolean }> {
  if (!ctx.db) return { notifications: [], unread: 0, saved: false };
  const user = await findUserByWallet(ctx.db, getAddress(owner));
  if (!user) return { notifications: [], unread: 0, saved: true };
  const rows = await listNotifications(ctx.db, user.id);
  const notifications = rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, at: r.created_at, read: r.read_at !== null }));
  return { notifications, unread: notifications.filter((n) => !n.read).length, saved: true };
}

export async function readNotifications(ctx: DomainContext, owner: Address, ids: string[]): Promise<number> {
  if (!ctx.db) return 0;
  const user = await findUserByWallet(ctx.db, getAddress(owner));
  return user ? markNotificationsRead(ctx.db, user.id, ids) : 0;
}
