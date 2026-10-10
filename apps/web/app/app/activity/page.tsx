"use client";

/**
 * What has happened.
 *
 * Two things make this a record rather than a feed: every item carries a receipt you can check
 * yourself, and the adjustments your own rules REFUSED appear here too. A refused adjustment
 * leaves no trace anywhere except Modalis's own record of having suggested it, so leaving it out
 * would quietly hide the moment the limits did their job.
 *
 * The page says which halves answered, so it never implies a complete history it does not have.
 */
import { useEffect, useState } from "react";
import type { ActivityItem } from "@modalis/domain";
import { Badge, Card, Empty, Notice, PageHeader, Rows, Row, SectionTitle, Skeleton } from "@/components/ui";
import { ReceiptLink } from "@/components/receipt-link";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { apiGet } from "@/lib/client-api";
import { moneyLabel, whenLabel } from "@/lib/format";
import { activityCsv, weekSummary } from "@/lib/statement";

type ActivityFeed = {
  items: ActivityItem[];
  sources: { chain: boolean; recommendations: boolean; indexer?: "envio" | "rpc" };
};

export default function ActivityPage() {
  return (
    <PortfolioGate>
      <Activity />
    </PortfolioGate>
  );
}

const TONES: Record<ActivityItem["kind"], "ok" | "warn" | "breach" | "accent" | "default"> = {
  plan_created: "accent",
  plan_changed: "default",
  plan_paused: "warn",
  money_added: "ok",
  money_withdrawn: "default",
  adjustment_made: "ok",
  adjustment_blocked: "breach",
  checkup: "default",
};

function Activity() {
  const { signedIn, address } = usePortfolio();
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    apiGet<ActivityFeed>("/api/activity")
      .then((d) => alive && setFeed(d))
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "We couldn't load your activity.");
      });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  if (error) return <Notice tone="warn">{error}</Notice>;
  if (!feed) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity"
        lede="Everything that has happened to your money, with a receipt for each one."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            {feed.items.length ? <DownloadCsv items={feed.items} /> : null}
            {feed.items.length ? (
              <button type="button" className={PILL} onClick={() => window.print()} title="Print, or choose “Save as PDF”">
                Statement (PDF)
              </button>
            ) : null}
            {address ? <ShareProof address={address} /> : null}
          </div>
        }
      />

      {feed.items.length ? (
        <Card>
          <SectionTitle>This week</SectionTitle>
          <p className="text-[15px] leading-relaxed text-ink">{weekSummary(feed.items).sentence}</p>
        </Card>
      ) : null}

      {feed.sources.indexer === "envio" ? (
        <p className="text-[13px] text-ink-muted">Indexed by Envio: settled history, read from Monad by an independent indexer.</p>
      ) : null}
      {!feed.sources.chain ? (
        <Notice tone="warn">
          We couldn&apos;t reach the record of what has settled, so this list may be incomplete.
        </Notice>
      ) : null}
      {!feed.sources.recommendations ? (
        <Notice tone="default">
          Adjustments Modalis suggested aren&apos;t being kept on this deployment, so only
          completed actions appear here.
        </Notice>
      ) : null}

      {feed.items.length === 0 ? (
        <Empty title="Nothing has happened yet">
          Add money to your plan and everything Modalis does with it will appear here.
        </Empty>
      ) : (
        <Rows>
          {feed.items.map((item) => (
            <Row key={item.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Badge tone={TONES[item.kind] ?? "default"}>{item.title}</Badge>
                  {item.amount ? (
                    <span className="numeric text-sm font-semibold text-ink">
                      {moneyLabel(item.amount)}
                    </span>
                  ) : null}
                </div>
                <span className="numeric text-xs text-ink-muted">
                  {whenLabel(item.at)}
                  {item.receipt ? (
                    <>
                      {" \u00b7 "}
                      <ReceiptLink reference={item.receipt.reference} />
                    </>
                  ) : null}
                </span>
              </div>
              {item.detail ? <p className="mt-2 text-sm text-ink-soft">{item.detail}</p> : null}
            </Row>
          ))}
        </Rows>
      )}
    </div>
  );
}

const PILL = "min-h-[42px] rounded-full bg-sunken px-4 text-[14px] font-semibold text-ink-soft hover:bg-line hover:text-ink";

/** Every transaction as a spreadsheet file, built in the browser from the list on screen. */
function DownloadCsv({ items }: { items: ActivityItem[] }) {
  return (
    <button
      type="button"
      className={PILL}
      onClick={() => {
        const url = URL.createObjectURL(new Blob([activityCsv(items)], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `modalis-activity-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      Download CSV
    </button>
  );
}

/** Copies a link to the public proof page: limits and transactions, from the chain only. */
function ShareProof({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="min-h-[42px] rounded-full bg-sunken px-4 text-[14px] font-semibold text-ink-soft hover:bg-line hover:text-ink"
      onClick={() => {
        const url = `${window.location.origin}/proof/${address}`;
        void navigator.clipboard?.writeText(url).then(() => setCopied(true));
      }}
      title="A page anyone can open to check your limits and transactions on Monad"
    >
      {copied ? "Link copied" : "Share proof page"}
    </button>
  );
}
