"use client";

/**
 * Every version of the plan the person signed, and why each one exists (§14).
 * Important financial rules are never silently changed; this is where that is visible.
 */
import { useEffect, useState } from "react";
import type { PlanVersion } from "@modalis/domain";
import { Card, SectionTitle } from "./ui";
import { ReceiptLink } from "./receipt-link";
import { apiGet } from "@/lib/client-api";

export function PlanHistory() {
  const [data, setData] = useState<{ versions: PlanVersion[]; saved: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    apiGet<{ versions: PlanVersion[]; saved: boolean }>("/api/plan/history")
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ versions: [], saved: false }));
    return () => {
      alive = false;
    };
  }, []);

  if (!data || !data.saved || data.versions.length === 0) return null;

  return (
    <Card>
      <SectionTitle hint="Every version you approved. Nothing here was changed without your signature.">
        Plan history
      </SectionTitle>
      <ol className="relative space-y-5 border-l border-line pl-5">
        {data.versions.map((v) => (
          <li key={v.version} className="relative">
            <span aria-hidden className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-ink ring-4 ring-surface" />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold text-ink">Version {v.version}</span>
              <span className="text-[13px] text-ink-muted">
                {new Date(v.approvedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              {v.receipt ? <span className="text-ink-muted"><ReceiptLink reference={v.receipt} /></span> : null}
            </div>
            {v.reason ? <p className="mt-1 text-[14px] text-ink-soft">{v.reason}</p> : null}
            {v.changes.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {v.changes.map((c) => (
                  <li key={c.label} className="numeric rounded-full bg-sunken px-3 py-1 text-[12.5px] text-ink-soft">
                    {c.label}: <span className="text-ink-muted line-through">{c.from}</span> → <span className="font-semibold text-ink">{c.to}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
