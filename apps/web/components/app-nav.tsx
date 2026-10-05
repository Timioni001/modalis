"use client";

/**
 * The signed-in navigation.
 *
 * Named for the person's tasks, not the system's modules. There is no "Portfolio", "Risk" or
 * "Mandate" here: those are our words for things, and a person managing their money thinks in
 * theirs — my goal, my money, what changed, what happened.
 *
 * On a phone it becomes a bottom bar, because the top of a tall screen is the hardest place for a
 * thumb to reach and this is the navigation someone uses while standing up.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
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
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Link href="/app" className="text-ink" aria-label="Modalis">
            <ModalisLogo size={25} />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Your money">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive(tab.href) ? "page" : undefined}
                className={`inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium transition-colors ${
                  isActive(tab.href)
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-soft hover:bg-surface-sunken hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/app/settings"
              aria-current={pathname.startsWith("/app/settings") ? "page" : undefined}
              aria-label="Settings"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                pathname.startsWith("/app/settings")
                  ? "bg-surface-sunken text-ink"
                  : "text-ink-soft hover:bg-surface-sunken hover:text-ink"
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
      >
        <div className="grid grid-cols-4">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-ink" : "text-ink-muted"
                }`}
              >
                <Icon active={active} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {/* Keeps the last row of content clear of the bar above. */}
      <div aria-hidden className="h-[60px] sm:hidden" />
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
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M4 15.5h3.2v-4H4zM8.4 15.5h3.2V8H8.4zM12.8 15.5H16V4.5h-3.2z" {...stroke(active)} />
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

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="2.6" {...stroke(false)} />
      <path
        d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2L4.8 4.8"
        {...stroke(false)}
      />
    </svg>
  );
}
