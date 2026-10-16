"use client";

import { Field, TextField } from "@/components/ui";
import {
  DEFAULT_SAVINGS_PREFERENCES,
  retrievalReminderAt,
  type SavingsPreferences,
  type SavingsSchedule,
} from "@modalis/domain/client";

export function SavingsPreferencesFields({
  value = DEFAULT_SAVINGS_PREFERENCES,
  onChange,
  id = "savings",
}: {
  value?: SavingsPreferences;
  onChange: (value: SavingsPreferences) => void;
  id?: string;
}) {
  return (
    <details className="rounded-2xl border border-line bg-sunken p-4">
      <summary className="min-h-11 cursor-pointer text-[15px] font-semibold text-ink">
        Custom savings details
      </summary>
      <div className="mt-4 space-y-5">
        <Field
          htmlFor={`${id}-minimum`}
          label="Minimum per contribution ($)"
          hint="The smallest complete contribution you want to make. Use 0 for no personal minimum. Cents are supported."
        >
          <TextField
            id={`${id}-minimum`}
            inputMode="decimal"
            value={value.minimumContribution}
            maxLength={12}
            onChange={(event) =>
              onChange({ ...value, minimumContribution: event.target.value })
            }
          />
        </Field>
        <Field
          htmlFor={`${id}-days`}
          label="Wait before retrieving (days)"
          hint="Your personal waiting period after approving this plan. 0 means no wait. This reminder allows early withdrawal; it does not lock your tokens."
        >
          <TextField
            id={`${id}-days`}
            type="number"
            inputMode="numeric"
            min={0}
            max={3650}
            step={1}
            value={
              Number.isNaN(value.minimumRetrievalDays)
                ? ""
                : value.minimumRetrievalDays
            }
            onChange={(event) =>
              onChange({
                ...value,
                minimumRetrievalDays:
                  event.target.value === "" ? NaN : Number(event.target.value),
              })
            }
          />
        </Field>
        <Field
          htmlFor={`${id}-details`}
          label="Anything else about your savings?"
          hint="Optional notes, up to 500 characters. Notes never trigger transfers or change your rules."
        >
          <textarea
            id={`${id}-details`}
            rows={3}
            maxLength={500}
            value={value.customDetails ?? ""}
            onChange={(event) =>
              onChange({ ...value, customDetails: event.target.value })
            }
            className="min-w-0 w-full resize-y rounded-2xl bg-surface px-4 py-3 text-base text-ink outline-none focus:ring-2 focus:ring-ink"
          />
        </Field>
      </div>
    </details>
  );
}

/** Deliberately separate from the contract's trading limits, on draft and approved plans. */
export function SavingsPreferencesSummary({
  savings,
}: {
  savings?: SavingsSchedule;
}) {
  if (!savings) return null;
  const reminderAt = retrievalReminderAt(savings);
  return (
    <div className="space-y-3 text-sm text-ink-soft">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt>Minimum per contribution</dt>
          <dd className="mt-1 font-semibold text-ink">
            {savings.minimumContribution === "0.00"
              ? "No personal minimum"
              : `$${savings.minimumContribution}`}
          </dd>
        </div>
        <div>
          <dt>Personal retrieval reminder</dt>
          <dd className="mt-1 font-semibold text-ink">
            {savings.minimumRetrievalDays === 0
              ? "No waiting period"
              : `${savings.minimumRetrievalDays} days after approval`}
          </dd>
        </div>
      </dl>
      {reminderAt ? (
        <p>
          Planned retrieval from{" "}
          {new Date(reminderAt).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}{" "}
          (UTC).
        </p>
      ) : null}
      {savings.customDetails ? (
        <p className="whitespace-pre-wrap break-words rounded-xl bg-sunken p-3">
          {savings.customDetails}
        </p>
      ) : null}
      <p>
        These are personal app settings. The vault allows its owner to withdraw
        at any time, subject to network confirmation. There is no guaranteed
        processing time.
      </p>
    </div>
  );
}
