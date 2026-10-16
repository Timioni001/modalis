"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationView } from "@modalis/domain";
import { apiGet, apiPost } from "@/lib/client-api";
import { Badge, Button, Card, Notice, PageHeader } from "@/components/ui";
import { useWallet } from "@/components/wallet-context";
import { WalletButton } from "@/components/wallet-button";

type Inbox = {
  notifications: NotificationView[];
  unread: number;
  saved: boolean;
};
export default function NotificationsPage() {
  const { address, loggedIn } = useWallet();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef(address);
  current.current = address;
  const load = useCallback(async () => {
    if (!address || !loggedIn) return;
    try {
      const result = await apiGet<Inbox>("/api/notifications");
      if (current.current !== address) return;
      setInbox(result);
      setOwner(address);
      setError("");
    } catch {
      if (current.current === address)
        setError("Couldn't read your notifications. Try again.");
    }
  }, [address, loggedIn]);
  useEffect(() => {
    setInbox(null);
    setError("");
    void load();
  }, [load]);
  const visible = owner === address ? inbox : null;
  async function markRead() {
    if (!visible || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/notifications/read", {
        ids: visible.notifications
          .filter((item) => !item.read)
          .map((item) => item.id),
      });
      await load();
    } catch {
      if (current.current === address)
        setError("Couldn't mark these read. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Notifications"
        lede="Updates from your own plan. Nothing here is generated as sample activity."
      />
      {!loggedIn ? <WalletButton signIn /> : null}
      {error ? (
        <Notice tone="warn">
          {error}
          <div className="mt-3">
            <Button variant="secondary" onClick={load}>
              Try again
            </Button>
          </div>
        </Notice>
      ) : null}
      {visible && !visible.saved ? (
        <Notice>Notifications aren't enabled on this deployment.</Notice>
      ) : visible ? (
        <>
          {visible.unread > 0 ? (
            <Button variant="secondary" onClick={markRead} busy={busy}>
              Mark all read
            </Button>
          ) : null}
          {visible.notifications.length === 0 ? (
            <Card>No notifications yet.</Card>
          ) : (
            <ul className="space-y-3">
              {visible.notifications.map((item) => (
                <Card as="li" key={item.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">{item.title}</h2>
                    {!item.read ? <Badge tone="accent">New</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-ink-soft">{item.body}</p>
                  <time
                    className="mt-3 block text-xs text-ink-muted"
                    dateTime={item.at}
                  >
                    {new Date(item.at).toLocaleString()}
                  </time>
                </Card>
              ))}
            </ul>
          )}
        </>
      ) : loggedIn && !error ? (
        <p role="status" className="text-sm text-ink-muted">
          Reading your notifications…
        </p>
      ) : null}
    </div>
  );
}
