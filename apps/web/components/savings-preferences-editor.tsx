"use client";

import { useState } from "react";
import {
  DEFAULT_SAVINGS_PREFERENCES,
  savingsPreferenceProblem,
  type SavingsSchedule,
} from "@modalis/domain/client";
import { Button, Card, Notice, SectionTitle } from "@/components/ui";
import {
  SavingsPreferencesFields,
  SavingsPreferencesSummary,
} from "./savings-preferences";
import { apiPatch } from "@/lib/client-api";

export function SavingsPreferencesEditor({
  savings,
  canSave,
  onSaved,
}: {
  savings?: SavingsSchedule;
  canSave: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(savings ?? DEFAULT_SAVINGS_PREFERENCES);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const problem = savingsPreferenceProblem(value);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (problem || busy || !canSave) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiPatch("/api/plan/savings", value);
      await onSaved();
      setEditing(false);
      setMessage("Your savings preferences are saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn't save your savings preferences.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <SectionTitle hint="Your own settings, separate from the signed trading rules.">
        Your savings preferences
      </SectionTitle>
      <SavingsPreferencesSummary savings={savings} />
      {!savings ? (
        <p className="text-sm text-ink-soft">
          No custom minimum or retrieval reminder has been saved.
        </p>
      ) : null}
      {!canSave ? (
        <p className="mt-3 text-sm text-ink-muted">
          Saving these details needs an approved goal and a configured database.
        </p>
      ) : null}
      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-4">
          <fieldset disabled={busy} className="min-w-0">
            <SavingsPreferencesFields
              value={value}
              onChange={setValue}
              id="edit-savings"
            />
          </fieldset>
          {problem ? <Notice tone="warn">{problem}</Notice> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={Boolean(problem)} busy={busy}>
              Save preferences
            </Button>
            <Button
              variant="quiet"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : canSave ? (
        <Button
          variant="quiet"
          className="mt-3"
          onClick={() => {
            setValue(savings ?? DEFAULT_SAVINGS_PREFERENCES);
            setMessage(null);
            setEditing(true);
          }}
        >
          Edit savings preferences
        </Button>
      ) : null}
      {message ? (
        <div className="mt-4">
          <Notice>{message}</Notice>
        </div>
      ) : null}
    </Card>
  );
}
