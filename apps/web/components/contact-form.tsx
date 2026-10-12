"use client";

/** The contact page's form. Signed-in only, so a reply has somewhere to go (see /api/contact). */
import { useState } from "react";
import { Button, Field, Notice, TextField } from "@/components/ui";
import { useWallet } from "@/components/wallet-context";
import { ApiError, apiPost } from "@/lib/client-api";

export function ContactForm() {
  const { loggedIn } = useWallet();
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loggedIn) {
    return <Notice>Sign in to send a message from here, or open an issue on the repository.</Notice>;
  }
  if (sent) return <Notice tone="ok" title="Message sent">Thank you. If you left an email, that&rsquo;s where a reply will go.</Notice>;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/contact", { message, email: email || undefined });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't send. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="not-prose space-y-4">
      <Field label="Your message" htmlFor="contact-message">
        <textarea
          id="contact-message"
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-2xl bg-surface px-4 py-3 text-[15px] text-ink shadow-[var(--shadow-card)] outline-none focus:shadow-[0_0_0_2px_var(--color-ink)]"
        />
      </Field>
      <Field label="Email for a reply (optional)" htmlFor="contact-email">
        <TextField id="contact-email" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {error ? <Notice tone="breach">{error}</Notice> : null}
      <Button onClick={send} busy={busy} busyLabel="Sending…" disabled={busy || !message.trim()}>
        Send message
      </Button>
    </div>
  );
}
