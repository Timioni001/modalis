"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { NavigationSheet } from "./navigation-sheet";
import type { SystemStatus } from "@/lib/api-types";
import { apiGet } from "@/lib/client-api";
import { ModalisLogo } from "./brand";
import { WalletButton } from "./wallet-button";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";

type Tab = {
  href: string;
  label: string;
  icon: (p: IconProps) => React.ReactElement;
};

const TABS: Tab[] = [
  { href: "/app", label: "Overview", icon: OverviewIcon },
  { href: "/app/money", label: "Money", icon: MoneyIcon },
  { href: "/app/plan", label: "Plan", icon: PlanIcon },
  { href: "/app/payments", label: "Payments", icon: MoneyIcon },
  { href: "/app/activity", label: "Activity", icon: ActivityIcon },
];

const MORE: Tab[] = [
  { href: "/app/profile", label: "Profile", icon: ProfileIcon },
  { href: "/app/notifications", label: "Notifications", icon: ActivityIcon },
  { href: "/app/goals", label: "Goals", icon: GoalsIcon },
  { href: "/app/circles", label: "Savings circles", icon: CirclesIcon },
  { href: "/app/scenarios", label: "What if", icon: WhatIfIcon },
  { href: "/app/ask", label: "Ask Modalis", icon: AskIcon },
  { href: "/app/tour", label: "2-minute tour", icon: TourIcon },
];

export function AppNav() {
  const pathname = usePathname() ?? "/app";
  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void apiGet<SystemStatus>("/api/status", controller.signal)
      .then(setStatus)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const more = MORE.filter((tab) =>
    ["/app/goals", "/app/notifications"].includes(tab.href)
      ? status?.poweredBy?.savedData
      : tab.href === "/app/circles"
        ? status?.technical?.contracts.savingsCircle
        : true,
  );
  const current = [
    ...TABS,
    ...MORE,
    { href: "/app/settings", label: "Settings", icon: SettingsIcon },
  ].find((tab) => isActive(tab.href)) ?? {
    href: pathname,
    label: "Your money",
    icon: MoneyIcon,
  };

  return (
    <>
      {/* ---------------------------------------------------------- desktop sidebar */}
      <aside className="fixed bottom-4 left-4 top-4 z-40 hidden w-[240px] flex-col overflow-y-auto rounded-[28px] bg-surface p-4 shadow-[var(--shadow-card)] lg:flex">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/app"
            className="flex min-h-[44px] items-center px-2 text-ink"
            aria-label="Modalis"
          >
            <ModalisLogo size={24} className="max-[359px]:[&>span]:hidden" />
          </Link>
          <div className="flex items-center">
            <ThemeToggle />
            <NotificationBell align="left" />
          </div>
        </div>

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
          {more.map((tab) => (
            <SideLink key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}
        </nav>

        <div className="mt-auto space-y-1">
          <SideLink
            tab={{
              href: "/app/settings",
              label: "Settings",
              icon: SettingsIcon,
            }}
            active={pathname.startsWith("/app/settings")}
          />
          <div className="px-1 pt-2">
            <WalletButton signIn />
          </div>
        </div>
      </aside>

      <header
        className="relative z-40 shrink-0 px-4 pt-4 pb-2 lg:hidden"
        data-testid="app-header"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full bg-surface/95 px-4 py-2 shadow-[var(--shadow-card)] backdrop-blur-xl">
          <Link
            href="/app"
            className="flex min-h-11 min-w-0 items-center text-ink"
            aria-label="Modalis"
          >
            <ModalisLogo size={24} />
          </Link>
          <NavigationSheet
            title="Menu"
            trigger={
              <>
                <MenuIcon />
                <span>Menu</span>
              </>
            }
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sunken p-3">
              <span className="text-xs font-medium text-ink-muted">
                Testnet demo · no real money
              </span>
              <ThemeToggle />
              <WalletButton signIn />
            </div>
            <nav aria-label="More pages" className="space-y-1">
              {more.map((tab) => (
                <SideLink
                  key={tab.href}
                  tab={tab}
                  active={isActive(tab.href)}
                />
              ))}
              <SideLink
                tab={{
                  href: "/app/settings",
                  label: "Settings",
                  icon: SettingsIcon,
                }}
                active={isActive("/app/settings")}
              />
            </nav>
          </NavigationSheet>
        </div>
      </header>

      <div
        data-testid="app-dock"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(14px,env(safe-area-inset-bottom))] lg:hidden"
      >
        <NavigationSheet
          title="Go to"
          bottom
          trigger={
            <>
              <current.icon active />
              <span className="min-w-0 truncate">{current.label}</span>
              <ChevronIcon />
            </>
          }
        >
          <nav aria-label="Your money" className="space-y-1">
            {TABS.map((tab) => (
              <SideLink key={tab.href} tab={tab} active={isActive(tab.href)} />
            ))}
            <SideLink
              tab={{ href: "/app/ask", label: "Ask Modalis", icon: AskIcon }}
              active={isActive("/app/ask")}
            />
          </nav>
          <Link
            href="/app/add-money"
            className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent text-sm font-semibold text-accent-ink"
          >
            <PlusIcon />
            Add money
          </Link>
        </NavigationSheet>
      </div>
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
        active
          ? "text-panel-ink"
          : "text-ink-soft hover:bg-sunken hover:text-ink"
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
      <path
        d="M3.5 9.2 10 3.8l6.5 5.4v6.3a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3z"
        {...stroke(active)}
      />
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
      <rect
        x="2.6"
        y="2.6"
        width="14.8"
        height="14.8"
        rx="4.6"
        {...stroke(active)}
      />
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

function GoalsIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="7" {...stroke(active)} />
      <circle cx="10" cy="10" r="3.6" {...stroke(active)} />
      <circle cx="10" cy="10" r="0.6" {...stroke(active)} />
    </svg>
  );
}

function WhatIfIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path
        d="M3 15.5c2.5 0 3-4 5.5-4s3 2 5 2 2.5-5 3.5-7"
        {...stroke(active)}
      />
      <path d="M3 4.5v11h14" {...stroke(active)} />
    </svg>
  );
}

function CirclesIcon({ active }: IconProps) {
  // Three members around a shared pot: a rotating savings circle.
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="2.5" {...stroke(active)} />
      <circle cx="10" cy="3.5" r="1.6" {...stroke(active)} />
      <circle cx="4.4" cy="13.3" r="1.6" {...stroke(active)} />
      <circle cx="15.6" cy="13.3" r="1.6" {...stroke(active)} />
    </svg>
  );
}

function TourIcon({ active }: IconProps) {
  // A play triangle in a circle: "show me".
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="7" {...stroke(active)} />
      <path d="M8.5 7.2v5.6l4.3-2.8z" {...stroke(active)} />
    </svg>
  );
}

function AskIcon({ active }: IconProps) {
  // A hexagon, after the reference, with a spark inside: "a question, answered from your plan".
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path
        d="M11 2.6 18.3 6.8v8.4L11 19.4 3.7 15.2V6.8z"
        {...stroke(active)}
      />
      <path
        d="M11 6.6l1.2 3.2 3.2 1.2-3.2 1.2L11 15.4l-1.2-3.2L6.6 11l3.2-1.2z"
        {...stroke(active)}
        strokeWidth={1.4}
      />
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

function ProfileIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="6.4" r="2.8" {...stroke(active)} />
      <path d="M4.2 16.5c.6-3 2.5-4.5 5.8-4.5s5.2 1.5 5.8 4.5" {...stroke(active)} />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 7h12M4 13h12" {...stroke()} />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="m5 12 5-5 5 5" {...stroke()} />
    </svg>
  );
}
