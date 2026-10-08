"use client";

/**
 * The signed-in navigation.
 *
 * Named for the person's tasks, not the system's modules — my goal, my money, what changed, what
 * happened. There is no "Portfolio", "Risk" or "Mandate" here.
 *
 * DESKTOP: a floating white sidebar with a black pill for the current page. The sidebar holds the
 * one action people come back for (add money) above everything else.
 *
 * PHONE: a black pill near the thumb, the current tab opened out into a white segment with its
 * label, the others reduced to icons. Beside it, a separate circle: Ask Modalis — one tap from
 * anywhere to "why?".
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ModalisLogo } from "./brand";
import { WalletButton } from "./wallet-button";

type Tab = { href: string; label: string; icon: (p: IconProps) => React.ReactElement };

const TABS: Tab[] = [
  { href: "/app", label: "Overview", icon: OverviewIcon },
  { href: "/app/money", label: "Money", icon: MoneyIcon },
  { href: "/app/plan", label: "Plan", icon: PlanIcon },
  { href: "/app/activity", label: "Activity", icon: ActivityIcon },
];

const MORE: Tab[] = [
  { href: "/app/scenarios", label: "What if", icon: WhatIfIcon },
  { href: "/app/ask", label: "Ask Modalis", icon: AskIcon },
];

export function AppNav() {
  const pathname = usePathname() ?? "/app";
  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <>
      {/* ---------------------------------------------------------- desktop sidebar */}
      <aside className="fixed bottom-4 left-4 top-4 z-40 hidden w-[240px] flex-col rounded-[28px] bg-surface p-4 shadow-[var(--shadow-card)] lg:flex">
        <Link href="/app" className="flex min-h-[44px] items-center px-2 text-ink" aria-label="Modalis">
          <ModalisLogo size={24} />
        </Link>

        <Link
          href="/app/add-money"
          className="mt-5 inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition-[filter] hover:brightness-[1.04]"
        >
          <PlusIcon />
          Add money
        </Link>

        <nav className="mt-6 space-y-1" aria-label="Your money">
          {TABS.map((tab) => (
            <SideLink key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}
        </nav>

        <div className="eyebrow mt-7 px-3 text-ink-muted">Understand</div>
        <nav className="mt-2 space-y-1" aria-label="Understand your plan">
          {MORE.map((tab) => (
            <SideLink key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}
        </nav>

        <div className="mt-auto space-y-1">
          <SideLink
            tab={{ href: "/app/settings", label: "Settings", icon: SettingsIcon }}
            active={pathname.startsWith("/app/settings")}
          />
          <div className="px-1 pt-2">
            <WalletButton />
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------ phone top bar */}
      <header className="sticky top-0 z-40 px-4 pt-4 lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-2 rounded-full bg-surface/90 px-3 py-2 shadow-[var(--shadow-card)] backdrop-blur-xl">
          <Link href="/app" className="flex min-h-[44px] items-center px-1 text-ink" aria-label="Modalis">
            <ModalisLogo size={24} />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/app/scenarios"
              aria-label="What if"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-sunken"
            >
              <WhatIfIcon />
            </Link>
            <Link
              href="/app/settings"
              aria-label="Settings"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-sunken"
            >
              <SettingsIcon />
            </Link>
            <WalletButton />
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ phone dock */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 px-4 pb-[max(14px,env(safe-area-inset-bottom))] lg:hidden">
        <nav
          aria-label="Your money"
          className="flex items-center gap-0.5 rounded-full bg-panel p-1.5 shadow-[var(--shadow-float)]"
        >
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={tab.label}
                className={`relative flex h-12 items-center justify-center rounded-full transition-colors ${
                  active ? "px-4 text-ink" : "w-12 text-panel-soft hover:text-panel-ink"
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="dock-active"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-surface"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ) : null}
                <span className="relative flex items-center gap-2">
                  <Icon active={active} />
                  {active ? <span className="text-[13.5px] font-semibold">{tab.label}</span> : null}
                </span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/app/ask"
          aria-label="Ask Modalis"
          aria-current={pathname.startsWith("/app/ask") ? "page" : undefined}
          className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-full bg-panel text-panel-ink shadow-[var(--shadow-float)] transition-transform active:scale-95"
        >
          <AskIcon />
        </Link>
      </div>
      {/* Keeps the last row of content clear of the dock. */}
      <div aria-hidden className="h-[92px] lg:hidden" />
    </>
  );
}

function SideLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-[44px] items-center gap-3 rounded-full px-3 text-[14.5px] font-medium transition-colors ${
        active ? "text-panel-ink" : "text-ink-soft hover:bg-sunken hover:text-ink"
      }`}
    >
      {active ? (
        <motion.span
          layoutId="side-active"
          aria-hidden
          className="absolute inset-0 rounded-full bg-panel"
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        />
      ) : null}
      <span className="relative">
        <Icon active={active} />
      </span>
      <span className="relative">{tab.label}</span>
    </Link>
  );
}

type IconProps = { active?: boolean };
const stroke = (active?: boolean) => ({
  stroke: "currentColor",
  strokeWidth: active ? 1.9 : 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
});

function OverviewIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M3.5 9.2 10 3.8l6.5 5.4v6.3a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3z" {...stroke(active)} />
      <path d="M8 14.2h4" {...stroke(active)} />
    </svg>
  );
}

function MoneyIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <rect x="2.5" y="5" width="15" height="10" rx="2.4" {...stroke(active)} />
      <circle cx="10" cy="10" r="2.1" {...stroke(active)} />
    </svg>
  );
}

function PlanIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <rect x="2.6" y="2.6" width="14.8" height="14.8" rx="4.6" {...stroke(active)} />
      <path d="M6.2 13.4h3v-3h3v-3h2" {...stroke(active)} />
    </svg>
  );
}

function ActivityIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M3 10h3l2.2-5 3.4 10L14 10h3" {...stroke(active)} />
    </svg>
  );
}

function WhatIfIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M3 15.5c2.5 0 3-4 5.5-4s3 2 5 2 2.5-5 3.5-7" {...stroke(active)} />
      <path d="M3 4.5v11h14" {...stroke(active)} />
    </svg>
  );
}

function AskIcon({ active }: IconProps) {
  // A hexagon, after the reference, with a spark inside: "a question, answered from your plan".
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path d="M11 2.6 18.3 6.8v8.4L11 19.4 3.7 15.2V6.8z" {...stroke(active)} />
      <path d="M11 6.6l1.2 3.2 3.2 1.2-3.2 1.2L11 15.4l-1.2-3.2L6.6 11l3.2-1.2z" {...stroke(active)} strokeWidth={1.4} />
    </svg>
  );
}

function SettingsIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M3 6.5h10M16 6.5h1M3 13.5h4M10 13.5h7" {...stroke(active)} />
      <circle cx="14.5" cy="6.5" r="2" {...stroke(active)} />
      <circle cx="8.5" cy="13.5" r="2" {...stroke(active)} />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
