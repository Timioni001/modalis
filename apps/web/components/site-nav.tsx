"use client";

/**
 * The public navigation.
 *
 * A product menu rather than a flat link bar, because the three questions a visitor to a money
 * product arrives with — *what is it, how does it work, why would I trust it* — each deserve more
 * than one word. The panel answers them with a sentence apiece instead of making someone guess
 * from a label.
 *
 * Mechanics that matter more than the look: the menu opens on click (never hover, which strands
 * touch users and fires on a mouse passing through), closes on Escape and on an outside click,
 * and the trigger carries `aria-expanded` so a screen reader knows the state.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ModalisLogo } from "./brand";
import { WalletButton } from "./wallet-button";

type MenuItem = { href: string; label: string; blurb: string };

const PRODUCT: MenuItem[] = [
  {
    href: "/how-it-works",
    label: "How it works",
    blurb: "Goal to plan to money, and what happens in between.",
  },
  {
    href: "/how-it-works#adjustments",
    label: "Adjustments",
    blurb: "What Modalis does when your plan drifts off target.",
  },
  {
    href: "/how-it-works#limits",
    label: "The limits you set",
    blurb: "Four rules that bound everything Modalis can do.",
  },
];

const TRUST: MenuItem[] = [
  {
    href: "/security",
    label: "How your money is protected",
    blurb: "Who can move it, who cannot, and what enforces that.",
  },
  {
    href: "/security#verify",
    label: "Check it yourself",
    blurb: "Every action leaves a receipt anyone can look up.",
  },
  {
    href: "/legal/risk",
    label: "Risks",
    blurb: "What can go wrong, said plainly rather than in a footnote.",
  },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Close on Escape and on a click outside. Both are expected of a menu and neither is free.
  useEffect(() => {
    if (!open && !mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobileOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, mobileOpen]);

  // A route change should never leave a menu hanging open over the new page.
  useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
  }, [pathname]);

  return (
    // Dark on the public site, so the bar and the hero below it read as one band rather than a
    // white strip floating on top of it.
    <header
      ref={navRef}
      className="sticky top-0 z-40 border-b border-[#1d212b] bg-[#0c0e13]/90 text-[#f4f4f2] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-5">
        <Link href="/" className="mr-4" aria-label="Modalis home">
          <ModalisLogo size={26} />
        </Link>

        <nav className="hidden items-center md:flex" aria-label="Main">
          <MenuTrigger label="Product" id="product" open={open} setOpen={setOpen} items={PRODUCT} />
          <MenuTrigger label="Trust" id="trust" open={open} setOpen={setOpen} items={TRUST} />
          <TopLink href="/how-it-works">How it works</TopLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/app"
            className="hidden min-h-[40px] items-center rounded-lg px-4 text-sm font-semibold text-[#b4bac4] transition-colors hover:text-[#f4f4f2] sm:inline-flex"
          >
            Open Modalis
          </Link>
          <WalletButton />
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#b4bac4] hover:text-[#f4f4f2] md:hidden"
          >
            <span className="sr-only">{mobileOpen ? "Close menu" : "Open menu"}</span>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="none">
              {mobileOpen ? (
                <path
                  d="M4 4l10 10M14 4L4 14"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M2 5h14M2 13h14"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* The panel sits under the whole bar, which gives the blurbs room to be sentences. */}
      {open ? (
        <div className="absolute inset-x-0 top-16 hidden border-b border-[#1d212b] bg-[#14171e] md:block">
          <div className="mx-auto grid max-w-6xl gap-1 px-5 py-6 sm:grid-cols-3">
            {(open === "product" ? PRODUCT : TRUST).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl p-4 transition-colors hover:bg-[#1d212b]"
              >
                <div className="text-sm font-semibold text-[#f4f4f2]">{item.label}</div>
                <div className="mt-1 text-sm text-[#8b919c]">{item.blurb}</div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {mobileOpen ? (
        <div id="mobile-nav" className="border-t border-[#1d212b] bg-[#14171e] md:hidden">
          <div className="space-y-6 px-5 py-6">
            <MobileGroup title="Product" items={PRODUCT} />
            <MobileGroup title="Trust" items={TRUST} />
            <Link
              href="/app"
              className="flex min-h-[48px] items-center justify-center rounded-xl bg-[#d6f34a] px-5 font-semibold text-[#10131a]"
            >
              Open Modalis
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function MenuTrigger({
  label,
  id,
  open,
  setOpen,
  items,
}: {
  label: string;
  id: string;
  open: string | null;
  setOpen: (v: string | null) => void;
  items: MenuItem[];
}) {
  const isOpen = open === id;
  return (
    <button
      type="button"
      onClick={() => setOpen(isOpen ? null : id)}
      aria-expanded={isOpen}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
        isOpen ? "text-[#f4f4f2]" : "text-[#b4bac4] hover:text-[#f4f4f2]"
      }`}
    >
      {label}
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden
        className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
      >
        <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{items.length} links</span>
    </button>
  );
}

function TopLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium text-[#b4bac4] transition-colors hover:text-[#f4f4f2]"
    >
      {children}
    </Link>
  );
}

function MobileGroup({ title, items }: { title: string; items: MenuItem[] }) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-[0.09em] text-[#707887]">
        {title}
      </div>
      <div className="mt-2 space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-[44px] items-center rounded-lg px-1 text-[15px] font-medium text-[#f4f4f2]"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
