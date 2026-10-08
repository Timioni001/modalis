"use client";

/** "What does my money depend on?" — the exposure view (§11), one grouping at a time. */
import { useEffect, useState } from "react";
import type { Exposure } from "@modalis/domain";
import { Card, SectionTitle } from "./ui";
import { apiGet } from "@/lib/client-api";
import { moneyLabel } from "@/lib/format";

const TABS: { key: keyof Exposure; label: string }[] = [
  { key: "byRisk", label: "Risks" },
  { key: "byKind", label: "Kind" },
  { key: "byInvestment", label: "Investment" },
  { key: "byVenue", label: "Where it trades" },
  { key: "byIssuer", label: "Issuer" },
  { key: "byChain", label: "Network" },
];

export function ExposureCard() {
  const [exposure, setExposure] = useState<Exposure | null>(null);
  const [tab, setTab] = useState<keyof Exposure>("byRisk");

  useEffect(() => {
    let alive = true;
    apiGet<{ exposure: Exposure }>("/api/exposure")
      .then((d) => alive && setExposure(d.exposure))
      .catch(() => alive && setExposure(null));
    return () => {
      alive = false;
    };
  }, []);

  if (!exposure || exposure.byInvestment.length === 0) return null;
  const lines = exposure[tab];

  return (
    <Card>
      <SectionTitle hint={tab === "byRisk" ? "One investment can carry several risks, so these can add up past 100%." : undefined}>
        What your money depends on
      </SectionTitle>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-[36px] flex-none rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
              tab === t.key ? "bg-panel text-panel-ink" : "bg-sunken text-ink-soft hover:bg-line hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {lines.map((l) => (
          <li key={l.label}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="text-ink">{l.label}</span>
              <span className="numeric text-ink-soft">
                {moneyLabel(l.value, 0)} <span className="ml-1 font-semibold text-ink">{l.percent}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, l.percent)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
