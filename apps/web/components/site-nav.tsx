"use client";

/**
 * The public navigation.
 *
 * A floating pill rather than a full-width bar. On a white page a bar needs a border to exist at
 * all, and that border cuts the page in two; a pill sits *on* the page instead, which keeps the
 * hero as the first thing you see.
 *
 * The product menu answers the three questions a visitor to a money product arrives with — what
 * is it, how does it work, why would I trust it — with a sentence apiece instead of a one-word
 * label to guess from.
 *
 * Mechanics that matter more than the look: the menu opens on click (never hover, which strands
 * touch users and fires on a mouse passing through), closes on Escape and on an outside click,
 * and the trigger carries `aria-expanded` so a screen reader knows the state.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const shell = useRef<HTMLDivElement>(null);

  // Any navigation closes everything. Without this the panel survives a route change.
  useEffect(() => {
    setOpen(false);
    setMobile(false);
  }, [pathname]);

  useEffect(() => {
    if (!open && !mobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMobile(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (shell.current && !shell.current.contains(e.target as Node)) {
        setOpen(false);
        setMobile(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, mobile]);

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 sm:px-5 sm:pt-5">
      <div ref={shell} className="relative mx-auto max-w-6xl">
        {/* Links left, mark centred, actions right — the mark is the anchor, not a corner. */}
        <nav
          aria-label="Main"
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-full bg-surface/90 px-3 py-2 backdrop-blur-xl sm:px-4"
        >
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-haspopup="true"
              className={`hidden min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition-colors md:inline-flex ${
                open ? "bg-sunken text-ink" : "text-ink-soft hover:bg-sunken hover:text-ink"
              }`}
            >
              Product
              <svg
                aria-hidden
                viewBox="0 0 12 12"
                className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                fill="none"
              >
                <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="hidden md:inline-flex">
              <NavLink href="/security" active={pathname === "/security"}>
                Security
              </NavLink>
            </span>
            <span className="hidden md:inline-flex">
              <NavLink href="/how-it-works" active={pathname === "/how-it-works"}>
                How it works
              </NavLink>
            </span>
            <Link
              href="/"
              className="flex min-h-[44px] items-center text-ink md:hidden"
              aria-label="Modalis home"
            >
              <ModalisLogo />
            </Link>
          </div>

          <Link
            href="/"
            className="hidden min-h-[44px] items-center text-ink md:flex"
            aria-label="Modalis home"
          >
            <ModalisLogo />
          </Link>
          <span className="md:hidden" />

          <div className="flex items-center justify-end gap-1.5">
            <span className="hidden md:inline-flex">
              <NavLink href="/contact" active={pathname === "/contact"}>
                Contact
              </NavLink>
            </span>
            <div className="hidden sm:block">
              <WalletButton />
            </div>
            <Link
              href="/onboarding"
              className="inline-flex min-h-[40px] items-center rounded-full bg-panel px-5 text-[13.5px] font-semibold text-panel-ink transition-opacity hover:opacity-90"
            >
              Start
            </Link>
            <button
              type="button"
              onClick={() => setMobile((v) => !v)}
              aria-expanded={mobile}
              aria-label={mobile ? "Close menu" : "Open menu"}
              className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-full text-ink hover:bg-sunken md:hidden"
            >
              <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none">
                {mobile ? (
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                ) : (
                  <path d="M3.5 6.5h13M3.5 13.5h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </nav>

        {/* ------------------------------------------------------ product panel */}
        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 right-0 top-[calc(100%+10px)] hidden overflow-hidden rounded-[28px] bg-surface p-3 shadow-[var(--shadow-float)] md:block"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <MenuColumn title="The product" items={PRODUCT} />
                <MenuColumn title="Trust" items={TRUST} />
              </div>
              <div className="mt-2 rounded-[20px] bg-sunken px-5 py-4 text-[13.5px] text-ink-soft">
                A technical demonstration on Monad testnet. Not an investment adviser, broker or
                fund.
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ------------------------------------------------------- mobile sheet */}
        <AnimatePresence>
          {mobile ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 right-0 top-[calc(100%+10px)] rounded-[28px] bg-surface p-3 shadow-[var(--shadow-float)] md:hidden"
            >
              <ul className="space-y-1">
                {[...PRODUCT.slice(0, 1), ...TRUST].map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-[18px] px-4 py-3.5 text-[15px] font-semibold text-ink hover:bg-sunken"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/contact"
                    className="block rounded-[18px] px-4 py-3.5 text-[15px] font-semibold text-ink hover:bg-sunken"
                  >
                    Contact
                  </Link>
                </li>
              </ul>
              <div className="mt-2 border-t border-line px-4 pt-4 sm:hidden">
                <WalletButton />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-[40px] items-center rounded-full px-4 text-[14px] font-semibold transition-colors ${
        active ? "bg-sunken text-ink" : "text-ink-soft hover:bg-sunken hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

function MenuColumn({ title, items }: { title: string; items: MenuItem[] }) {
  return (
    <div>
      <div className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        {title}
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-[20px] px-4 py-3 transition-colors hover:bg-sunken"
            >
              <span className="block text-[14.5px] font-semibold text-ink">{item.label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">
                {item.blurb}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
