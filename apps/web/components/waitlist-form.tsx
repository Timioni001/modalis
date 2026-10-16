"use client";

import { useState } from "react";
import { ApiError, apiPost } from "@/lib/client-api";
import { Button, Notice, TextField } from "./ui";

/** A small public signup surface; no wallet or account is needed. */
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/waitlist", { email });
      setJoined(true);
    } catch (problem) {
      setError(
        problem instanceof ApiError
          ? problem.message
          : "We couldn't save that email. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (joined) {
    return (
      <Notice tone="ok" title="You’re on the list">
        We’ll use this address for early access updates. No wallet is needed yet.
      </Notice>
    );
  }

  return (
    <form
      className="rounded-[24px] bg-white/10 p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && email.trim()) void join();
      }}
    >
      <label htmlFor="waitlist-email" className="text-sm font-semibold">
        Join the wait-list
      </label>
      <p className="mt-1.5 text-sm leading-relaxed text-panel-soft">
        Get a note when the consumer app is ready for more people.
      </p>
      <TextField
        id="waitlist-email"
        type="email"
        required
        autoComplete="email"
        maxLength={200}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="mt-4 bg-surface"
        aria-describedby={error ? "waitlist-error" : undefined}
      />
      {error ? (
        <p id="waitlist-error" className="mt-2 text-xs text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="mt-3 w-full" busy={busy} busyLabel="Joining…">
        Join the list
      </Button>
      <p className="mt-3 text-[11px] leading-relaxed text-panel-soft">
        One email. No marketing trail. Unsubscribe whenever you want.
      </p>
    </form>
  );
}
