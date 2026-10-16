"use client";

/**
 * The bell. Every notification here was written by the server at the moment something real
 * happened (see domain `emit`); nothing is generated in the browser. Opening it marks them read.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { NotificationView } from "@modalis/domain";
import { apiGet, apiPost } from "@/lib/client-api";
import { useWallet } from "./wallet-context";

const DOT: Record<NotificationView["kind"], string> = {
  done: "bg-ok",
  attention: "bg-warn",
  safety: "bg-breach",
  info: "bg-ink-muted",
};

export function NotificationBell({ align = "right" }: { align?: "right" | "left" }) {
  // The nav sits outside the portfolio provider, so sign-in comes from the wallet itself.
  const { loggedIn: signedIn, address } = useWallet();
  const [data, setData] = useState<{ notifications: NotificationView[]; unread: number; saved: boolean } | null>(null);
  const [dataOwner, setDataOwner] = useState<string | null>(null);
  const accountRef = useRef(address);
  accountRef.current = address;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiGet<{ notifications: NotificationView[]; unread: number; saved: boolean }>("/api/notifications");
      if (accountRef.current !== address) return;
      setDataOwner(address);
      setData(result);
    } catch {
      if (accountRef.current === address) setData(null);
    }
  }, [address]);

  useEffect(() => {
    setData(null);
    setOpen(false);
    if (!signedIn) return;
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [signedIn, load]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    const unreadIds = data?.notifications.filter((n) => !n.read).map((n) => n.id) ?? [];
    if (next && unreadIds.length > 0) {
      await apiPost("/api/notifications/read", { ids: unreadIds }).catch(() => undefined);
      setData((d) => (d ? { ...d, unread: 0, notifications: d.notifications.map((n) => ({ ...n, read: true })) } : d));
    }
  }

  if (!signedIn || dataOwner !== address || !data?.saved) return null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={data.unread > 0 ? `Notifications, ${data.unread} new` : "Notifications"}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-sunken hover:text-ink"
      >
        <svg aria-hidden width="19" height="19" viewBox="0 0 20 20" fill="none">
          <path d="M5 8.5a5 5 0 0 1 10 0v3.2l1.4 2.3H3.6L5 11.7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M8.2 16.2a1.9 1.9 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {data.unread > 0 ? (
          <span className="numeric absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-breach px-1 text-[10px] font-semibold text-white">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className={`fixed inset-x-4 top-20 z-50 lg:absolute lg:inset-x-auto lg:top-12 lg:w-[360px] rounded-[24px] bg-surface p-2 shadow-[var(--shadow-float)] ${align === "right" ? "lg:right-0" : "lg:left-0"}`}
          >
            <div className="px-3 pb-1 pt-2 text-[13px] font-semibold text-ink">Notifications</div>
            {data.notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-[14px] text-ink-muted">Nothing yet.</p>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto">
                {data.notifications.map((n) => (
                  <li key={n.id} className="flex gap-3 rounded-[18px] px-3 py-3 hover:bg-sunken">
                    <span aria-hidden className={`mt-1.5 h-2 w-2 flex-none rounded-full ${DOT[n.kind]}`} />
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-ink">{n.title}</div>
                      <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{n.body}</p>
                      <div className="mt-1 text-[11.5px] text-ink-muted">
                        {new Date(n.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
