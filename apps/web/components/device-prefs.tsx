"use client";

/**
 * Per-device preferences that live in the browser, never on a server:
 *
 *  - The service worker that makes the installed app open offline (public/sw.js).
 *  - Low-data mode: no animations, and live data refreshed less often. Turned on by hand in
 *    Settings, or automatically when the browser reports Data Saver.
 */
import { useEffect, useRef, useState } from "react";
import { useWallet } from "./wallet-context";

export const LOW_DATA_KEY = "modalis.lowData";

/** Runs before React so the page never animates once and then stops. */
export const LOW_DATA_SCRIPT = `try{var v=localStorage.getItem("${LOW_DATA_KEY}");var s=navigator.connection&&navigator.connection.saveData;if(v==="1"||(v===null&&s))document.documentElement.dataset.lowdata="1"}catch(e){}`;

export function isLowData(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.lowdata === "1";
}

export function setLowData(on: boolean) {
  try {
    localStorage.setItem(LOW_DATA_KEY, on ? "1" : "0");
  } catch {
    // Private mode: the switch still applies to this visit.
  }
  if (on) document.documentElement.dataset.lowdata = "1";
  else delete document.documentElement.dataset.lowdata;
}

export function ServiceWorker() {
  const { loggedIn } = useWallet();
  const wasIn = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  // Signing out drops the saved copies, so the next person on this device sees nothing of yours.
  useEffect(() => {
    if (wasIn.current && !loggedIn) clearOfflineCopies();
    wasIn.current = loggedIn;
  }, [loggedIn]);
  return null;
}

/** Tells the service worker to drop its saved copies, e.g. on sign-out. */
export function clearOfflineCopies() {
  navigator.serviceWorker?.controller?.postMessage("clear");
}

export function LowDataToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(isLowData()), []);
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-[15px] font-medium text-ink">Low-data mode</span>
        <span className="block text-sm text-ink-muted">No animations, and live numbers refresh every few seconds instead of every block.</span>
      </span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[var(--color-ink)]"
        checked={on}
        onChange={(e) => {
          setLowData(e.target.checked);
          setOn(e.target.checked);
        }}
      />
    </label>
  );
}
