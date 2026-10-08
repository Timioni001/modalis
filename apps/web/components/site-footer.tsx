"use client";

/**
 * The footer.
 *
 * Most money products bury their limitations in grey 10px type. Modalis's whole argument is that
 * its limits are the feature, so the limitations ARE the footer: two cards, equal size, equal
 * weight, can beside can't. Nothing on the page says more clearly what this product is.
 *
 * Each line is a phrase, not a sentence. A footer nobody finishes reading is a footer that
 * disclosed nothing.
 *
 * It closes on the wordmark set oversized and cropped by the viewport — the one piece of pure
 * decoration in the product, and it earns its place by being the full stop.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SystemStatus } from "@/lib/api-types";

const CAN = [
  "Build your plan",
  "Keep money inside your limits",
  "Tell you if you're on track",
  "Suggest a fix when it drifts",
  "Show a receipt for everything",
];

const CANNOT = [
  "Move your money out",
  "Change your limits",
  "Act outside them",
  "Promise you a return",
  "Trade without your approval",
];

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/how-it-works#limits", label: "The limits" },
      { href: "/how-it-works#adjustments", label: "Adjustments" },
      { href: "/app", label: "Open Modalis" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/security", label: "Security" },
      { href: "/security#verify", label: "Verify it yourself" },
      { href: "/security#built-with", label: "What it runs on" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/risk", label: "Risks" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/acceptable-use", label: "Acceptable use" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 pb-6">
        {/* ------------------------------------------- the argument, in two cards */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[28px] bg-canvas p-6 sm:p-8">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
              Modalis can
            </h2>
            <ul className="mt-5 space-y-3.5">
              {CAN.map((line) => (
                <li key={line} className="flex gap-3 text-[15px] text-ink">
                  <CheckIcon />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[28px] bg-canvas p-6 sm:p-8">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
              Modalis can&rsquo;t
            </h2>
            <ul className="mt-5 space-y-3.5">
              {CANNOT.map((line) => (
                <li key={line} className="flex gap-3 text-[15px] text-ink-soft">
                  <BarIcon />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-ink-muted">
              Enforced, not promised.{" "}
              <Link href="/security" className="font-medium text-ink underline underline-offset-2">
                Here&rsquo;s how
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------------ links */}
        <div className="mt-4 rounded-[28px] bg-canvas px-6 pb-8 pt-10 sm:px-10">
        <nav className="grid gap-8 sm:grid-cols-3" aria-label="Footer">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <div className="text-[13px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
                {column.title}
              </div>
              <ul className="mt-4 space-y-1">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="-mx-2 flex min-h-[38px] items-center rounded-full px-2 text-[15px] text-ink-soft transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* ---------------------------------------------------------- the disclosure */}
        <div className="mt-10 space-y-4 border-t border-line-strong/60 pt-8 text-xs leading-relaxed text-ink-muted">
          <p className="max-w-2xl">
            <strong className="font-semibold text-ink-soft">A technical demonstration.</strong>{" "}
            Modalis is not an investment adviser, broker, bank or fund, and holds no licence
            anywhere. Nothing here is advice. No return is promised. You could lose what you put
            in, and the demo investments aren&rsquo;t real assets.{" "}
            <Link
              href="/legal/risk"
              className="font-medium text-ink-soft underline underline-offset-2"
            >
              Full risks
            </Link>
            .
          </p>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <NetworkLine />
            <p>&copy; {new Date().getFullYear()} Modalis</p>
          </div>
        </div>
        </div>
      </div>

      {/* The full stop. Cropped on purpose — a wordmark that fits looks like a logo, one that
          runs off the edge looks like the end of the document. */}
      <div
        aria-hidden
        className="display select-none px-5 text-center text-[23vw] font-semibold leading-[0.72] tracking-[-0.04em] text-ink/[0.07]"
        style={{ marginBottom: "-0.14em" }}
      >
        Modalis
      </div>
    </footer>
  );
}

/**
 * The network, read from this deployment rather than written into the markup.
 *
 * A footer that says "Live on Monad" in hardcoded text lies the moment the node goes down.
 */
function NetworkLine() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => alive && setStatus(d as SystemStatus))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return <p>Status unavailable.</p>;
  if (!status) return <p className="opacity-0">Checking&hellip;</p>;

  const reachable = status.network.reachable;
  return (
    <p className="flex items-center gap-2">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${reachable ? "bg-ok" : "bg-breach"}`}
      />
      {reachable ? (
        <>
          {status.network.name}
          {status.network.blockNumber ? (
            <span className="numeric"> &middot; block {status.network.blockNumber}</span>
          ) : null}
        </>
      ) : (
        <>{status.network.name} unreachable</>
      )}
    </p>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-1 flex-none text-ok"
    >
      <path
        d="M3 8.5l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BarIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-1 flex-none text-ink-muted"
    >
      <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
