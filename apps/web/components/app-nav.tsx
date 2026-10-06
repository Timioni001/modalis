"use client";

/**
 * The signed-in navigation.
 *
 * Named for the person's tasks, not the system's modules. There is no "Portfolio", "Risk" or
 * "Mandate" here: those are our words for things, and a person managing their money thinks in
 * theirs — my goal, my money, what changed, what happened.
 *
 * On a phone it becomes a floating bar near the thumb, because the top of a tall screen is the
 * hardest place for a thumb to reach and this is the navigation someone uses while standing up.
 * The active tab is a filled pill rather than a colour change, so it reads at a glance and
 * without relying on colour.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ModalisLogo } from "./brand";
import { WalletButton } from "./wallet-button";

const TABS = [
  { href: "/app", label: "Overview", icon: OverviewIcon },
  { href: "/app/money", label: "Money", icon: MoneyIcon },
  { href: "/app/plan", label: "Plan", icon: PlanIcon },
  { href: "/app/activity", label: "Activity", icon: ActivityIcon },
];

export function AppNav() {
  const pathname = usePathname() ?? "/app";
  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-40 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="mx-auto flex max-w-5xl items-center gap-2 rounded-full bg-surface/90 px-3 py-2.5 shadow-[var(--shadow-card)] backdrop-blur-xl sm:px-4">
          <Link href="/app" className="flex min-h-[44px] items-center px-1 text-ink" aria-label="Modalis">
            <ModalisLogo size={24} />
          </Link>

          <nav className="ml-2 hidden items-center gap-0.5 sm:flex" aria-label="Your money">
            {TABS.map((tab) => {
              const active = isActive(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex min-h-[40px] items-center rounded-full px-4 text-[14px] font-semibold transition-colors ${
                    active ? "text-panel-ink" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {active ? (
                    <motion.span
                      layoutId="app-tab"
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-panel"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  ) : null}
                  <span className="relative">{tab.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/app/settings"
              aria-current={pathname.startsWith("/app/settings") ? "page" : undefined}
              aria-label="Settings"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                pathname.startsWith("/app/settings")
                  ? "bg-panel text-panel-ink"
                  : "text-ink-soft hover:bg-sunken hover:text-ink"
              }`}
            >
              <SettingsIcon />
            </Link>
            <WalletButton />
          </div>
        </div>
      </header>

      {/* Thumb-reachable on a phone. Hidden once there is room for the top bar. */}
      <nav
        aria-label="Your money"
        className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(14px,env(safe-area-inset-bottom))] sm:hidden"
      >
        <div className="mx-auto flex max-w-sm items-center gap-1 rounded-full bg-panel p-1.5 shadow-[var(--shadow-float)]">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-semibold transition-colors ${
                  active ? "text-accent-ink" : "text-panel-soft"
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="app-tab-mobile"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ) : null}
                <span className="relative">
                  <Icon active={active} />
                </span>
                <span className="relative">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      {/* Keeps the last row of content clear of the floating bar above. */}
      <div aria-hidden className="h-[84px] sm:hidden" />
    </>
  );
}

type IconProps = { active?: boolean };
const stroke = (active?: boolean) => ({
  stroke: "currentColor",
  strokeWidth: active ? 2 : 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
});

function OverviewIcon({ active }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden>
      <path d="M4 15.5h3.2v-4H4zM8.4 15.5h3.2V8H8.4zM12.8 15.5H16V4.5h-3.2z" {...stroke(active)} />
    </svg>
  );
}

function MoneyIcon({ active }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden>
      <rect x="2.5" y="5" width="15" height="10" rx="2.4" {...stroke(active)} />
      <circle cx="10" cy="10" r="2.1" {...stroke(active)} />
    </svg>
  );
}

function PlanIcon({ active }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden>
      <rect x="2.6" y="2.6" width="14.8" height="14.8" rx="4.6" {...stroke(active)} />
      <path d="M6.2 13.4h3v-3h3v-3h2" {...stroke(active)} />
    </svg>
  );
}

function ActivityIcon({ active }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden>
      <path d="M3 10h3l2.2-5 3.4 10L14 10h3" {...stroke(active)} />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
      <path d="M3 6.5h10M16 6.5h1M3 13.5h4M10 13.5h7" {...stroke(false)} />
      <circle cx="14.5" cy="6.5" r="2" {...stroke(false)} />
      <circle cx="8.5" cy="13.5" r="2" {...stroke(false)} />
    </svg>
  );
}
