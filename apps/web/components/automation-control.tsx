"use client";

/** The three automation levels (§33), with the wait before more authority takes effect (§18). */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AutomationLevel, AutomationView } from "@modalis/domain";
import { Card, Notice, SectionTitle } from "./ui";
import { ApiError, apiGet, apiPost } from "@/lib/client-api";

const LEVELS: { value: AutomationLevel; title: string; body: string }[] = [
  { value: "guided", title: "Suggest only", body: "Modalis tells you what it would change. It carries out nothing." },
  { value: "assisted", title: "Ask me first", body: "Modalis prepares each change and explains it. It runs when you approve." },
  { value: "automated", title: "Do it for me", body: "Modalis makes changes your plan allows without asking. It can't take money out, and you can revoke it in settings." },
];

export function AutomationControl() {
  const [view, setView] = useState<AutomationView | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<{ automation: AutomationView }>("/api/automation").then((d) => setView(d.automation)).catch(() => setView(null));
  }, []);

  if (!view) return null;

  async function choose(level: AutomationLevel) {
    setSaving(true);
    try {
      const { automation } = await apiPost<{ automation: AutomationView }>("/api/automation", { level });
      setView(automation);
      toast.success(automation.requestedLevel ? `That takes effect in ${automation.delayHours} hours. You can cancel before then.` : "Saved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That didn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionTitle hint="Your limits apply at every level. Giving Modalis more freedom waits a day; taking it away is immediate.">
        How much Modalis does on its own
      </SectionTitle>
      {!view.saved ? (
        <Notice tone="default">Automation settings need saved data, which isn&rsquo;t set up on this deployment.</Notice>
      ) : (
        <div role="radiogroup" aria-label="Automation level" className="grid gap-2.5 sm:grid-cols-3">
          {LEVELS.map((l) => {
            const active = view.level === l.value;
            const pending = view.requestedLevel === l.value;
            return (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                onClick={() => choose(l.value)}
                className={`rounded-[20px] p-4 text-left transition-colors ${active ? "bg-panel text-panel-ink" : "bg-sunken text-ink hover:bg-line"}`}
              >
                <div className="text-[14.5px] font-semibold">{l.title}</div>
                <p className={`mt-1 text-[13px] leading-snug ${active ? "text-panel-soft" : "text-ink-muted"}`}>{l.body}</p>
                {pending && view.effectiveAt ? (
                  <p className="mt-2 text-[12.5px] font-semibold text-warn">
                    Starts {new Date(view.effectiveAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
