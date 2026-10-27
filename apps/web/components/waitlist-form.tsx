"use client";

import { useState } from "react";
import { Button, Notice, TextField } from "./ui";

/** Presentation-only signup interaction. Emails are not sent or persisted. */
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);

  if (joined) {
    return (
      <Notice tone="ok" title="Added to waitlist">
        Thanks for your interest in Modalis.
      </Notice>
    );
  }

  return (
    <form
      className="rounded-[24px] bg-white/10 p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (email.trim()) setJoined(true);
      }}
    >
      <label htmlFor="waitlist-email" className="text-sm font-semibold">
        Join the wait-list
      </label>
      <p className="mt-1.5 text-sm leading-relaxed text-panel-soft">
        A calmer way to keep your goals in reach.
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
      />
      <Button type="submit" className="mt-3 w-full">
        Join the list
      </Button>
      <p className="mt-3 text-[11px] leading-relaxed text-panel-soft">
        No wallet needed.
      </p>
    </form>
  );
}
