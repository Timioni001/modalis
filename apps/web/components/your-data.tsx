"use client";

/** Settings → Your data: download everything Modalis stores about you, or delete it (/api/account). */
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { ApiError, apiDelete, apiGet } from "@/lib/client-api";

export function YourData() {
  const [busy, setBusy] = useState<"get" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy("get");
    setError(null);
    try {
      const data = await apiGet<unknown>("/api/account");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `modalis-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't prepare your data.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      await apiDelete("/api/account");
      setConfirming(false);
      setDone("Deleted. Modalis no longer stores anything about you. Your money is still in your plan on Monad, and only you can withdraw it.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't delete your data.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-ink-soft">
        Goals, plan history, notifications and messages are stored in Modalis&rsquo;s database. Your money
        and transactions live on Monad, which is public and can&rsquo;t be deleted by anyone.
      </p>
      {error ? <Notice tone="breach">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={download} busy={busy === "get"} busyLabel="Preparing…" disabled={busy !== null}>
          Download my data
        </Button>
        {!confirming ? (
          <Button variant="quiet" onClick={() => setConfirming(true)} disabled={busy !== null || Boolean(done)}>
            Delete my data
          </Button>
        ) : (
          <Button variant="danger" onClick={remove} busy={busy === "delete"} busyLabel="Deleting…" disabled={busy !== null}>
            Yes, delete everything Modalis stores
          </Button>
        )}
      </div>
    </div>
  );
}
