"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { NavigationSheet } from "./navigation-sheet";
import { CommandPalette, SearchIcon, type PaletteItem } from "./command-palette";
import { SIDEBAR_KEY } from "@/lib/first-paint";
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

type Group = { title: string; tabs: Tab[] };

/** The four places people go most. On a phone these are the tab bar; everything else is "More". */
const TABS: Tab[] = [
  { href: "/app", label: "Home", icon: OverviewIcon },
  { href: "/app/money", label: "Money", icon: MoneyIcon },
  { href: "/app/plan", label: "Plan", icon: PlanIcon },
  { href: "/app/activity", label: "Activity", icon: ActivityIcon },
];

/** Everything else, in the same groups on desktop and phone so a page is always in one place. */
const GROUPS: Group[] = [
  {
    title: "Move money",
    tabs: [
      { href: "/app/add-money", label: "Add money", icon: PlusCircleIcon },
      { href: "/app/withdraw", label: "Take money out", icon: WithdrawIcon },
      { href: "/app/payments", label: "Payments", icon: SendIcon },
      { href: "/app/gift", label: "Send to a goal", icon: GiftIcon },
    ],
  },
  {
    title: "Plan ahead",
    tabs: [
      { href: "/app/goals", label: "Goals", icon: GoalsIcon },
      { href: "/app/circles", label: "Savings circles", icon: CirclesIcon },
      { href: "/app/scenarios", label: "What if", icon: WhatIfIcon },
    ],
  },
  {
    title: "Help",
    tabs: [
      { href: "/app/ask", label: "Ask Modalis", icon: AskIcon },
      { href: "/app/tour", label: "2-minute tour", icon: TourIcon },
    ],
  },
  {
    title: "Account",
    tabs: [
      { href: "/app/profile", label: "Profile", icon: ProfileIcon },
      { href: "/app/notifications", label: "Notifications", icon: BellIcon },
      { href: "/app/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

/** Words people type for a page that are not in its name. */
const KEYWORDS: Record<string, string> = {
  "/app": "overview dashboard start",
  "/app/money": "balance assets portfolio holdings",
  "/app/plan": "allocation strategy mandate rules",
  "/app/activity": "history transactions receipts explorer",
  "/app/add-money": "deposit fund top up buy faucet",
  "/app/withdraw": "withdraw cash out sell",
  "/app/payments": "send request pay transfer",
  "/app/gift": "gift contribute someone",
  "/app/goals": "targets saving",
  "/app/circles": "group rotating savings",
  "/app/scenarios": "twin simulate scenario market",
  "/app/ask": "ai chat question help",
  "/app/tour": "guide demo walkthrough",
  "/app/profile": "account wallet",
  "/app/notifications": "alerts",
  "/app/settings": "preferences theme dark mode sign out",
};

export function AppNav() {
  const pathname = usePathname() ?? "/app";
  const isActive = (href: string) =>
    href === "/app"
      ? pathname === "/app"
      : pathname === href || pathname.startsWith(`${href}/`);

  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void apiGet<SystemStatus>("/api/status", controller.signal)
      .then(setStatus)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  // Pages whose backing service is off are hidden rather than shown as dead ends.
  const shown = (tab: Tab) =>
    ["/app/goals", "/app/notifications"].includes(tab.href)
      ? Boolean(status?.poweredBy?.savedData)
      : tab.href === "/app/circles"
        ? Boolean(status?.technical?.contracts.savingsCircle)
        : true;
  const groups = GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter(shown),
  })).filter((group) => group.tabs.length > 0);
  const inMore = groups.some((group) =>
    group.tabs.some((tab) => isActive(tab.href)),
  );
  const palette: PaletteItem[] = [
    ...TABS.map((tab) => ({ ...tab, group: "Main" })),
    ...groups.flatMap((group) =>
      group.tabs.map((tab) => ({ ...tab, group: group.title })),
    ),
  ].map((item) => ({ ...item, keywords: KEYWORDS[item.href] }));

  // Folded to an icon rail or open, remembered in this browser (see lib/first-paint).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded");
    } catch {}
  };

  // The sidebar's own Add money button and bell cover these two.
  const sideGroups = groups
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter(
        (tab) =>
          !["/app/add-money", "/app/notifications", "/app/profile", "/app/settings"].includes(tab.href),
      ),
    }))
    .filter((group) => group.tabs.length > 0);

  return (
    <>
      {/* ---------------------------------------------------------- desktop sidebar */}
      <Tooltip.Provider delay={120}>
        <aside
          data-collapsed={collapsed || undefined}
          className={`fixed bottom-4 left-4 top-4 z-40 hidden flex-col overflow-hidden rounded-[28px] bg-surface shadow-[var(--shadow-card)] transition-[width] duration-300 ease-out lg:flex [&>*]:shrink-0 ${
            collapsed ? "w-[88px] items-center px-3 py-4" : "w-[256px] p-4"
          }`}
        >
          {/* Workspace header */}
          <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : "justify-between"}`}>
            <Link
              href="/app"
              aria-label="Modalis home"
              className="flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-2xl px-1.5 text-ink"
            >
              <ModalisLogo size={30} showWord={false} />
              {collapsed ? null : (
                <span className="min-w-0 leading-tight">
                  <span className="display block text-[16px] font-bold tracking-tight">
                    Modalis
                  </span>
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-px text-[11px] font-semibold whitespace-nowrap text-ink-soft">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Monad Testnet
                  </span>
                </span>
              )}
            </Link>
            <RailTip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} enabled>
              <button
                type="button"
                onClick={toggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
              >
                <PanelIcon collapsed={collapsed} />
              </button>
            </RailTip>
          </div>

          <div className={`my-3 h-px bg-line ${collapsed ? "w-10" : "w-full"}`} />

          {/* Search and the one primary action */}
          <CommandPalette
              items={palette}
              shortcut
              triggerLabel="Search pages (⌘K)"
              triggerClassName={
                collapsed
                  ? "flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink-muted shadow-[var(--shadow-card)] transition-colors hover:text-ink"
                  : "flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-[14px] text-ink-muted shadow-[var(--shadow-card)] transition-colors hover:text-ink"
              }
              trigger={
                <>
                  <SearchIcon />
                  {collapsed ? null : (
                    <>
                      <span className="flex-1 text-left">Jump to…</span>
                      <kbd className="rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">
                        ⌘K
                      </kbd>
                    </>
                  )}
                </>
              }
            />

          <RailTip label="Add money" enabled={collapsed}>
            <Link
              href="/app/add-money"
              aria-label={collapsed ? "Add money" : undefined}
              className={`mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-semibold text-accent-ink transition-[filter] hover:brightness-[1.04] ${
                collapsed ? "w-11" : "w-full"
              }`}
            >
              <PlusIcon />
              {collapsed ? null : "Add money"}
            </Link>
          </RailTip>

          <nav
            // The only part that scrolls: the header, search and account stay put on short screens.
            className={`-mx-2 mt-3 min-h-0 shrink! grow overflow-y-auto px-2 pb-1 ${collapsed ? "w-[calc(100%+16px)]" : ""}`}
            aria-label="App"
          >
            <ul className="space-y-0.5">
              {TABS.map((tab) => (
                <li key={tab.href}>
                  <RailLink tab={tab} active={isActive(tab.href)} collapsed={collapsed} />
                </li>
              ))}
            </ul>
            {sideGroups.map((group) => (
              <FoldGroup
                key={group.title}
                group={group}
                isActive={isActive}
                collapsed={collapsed}
              />
            ))}
          </nav>

          {/* Account */}
          <div className={`border-t border-line pt-3 ${collapsed ? "flex w-full flex-col items-center" : ""}`}>
            <ul className={`space-y-0.5 ${collapsed ? "w-full" : ""}`}>
              {[
                { href: "/app/profile", label: "Profile", icon: ProfileIcon },
                { href: "/app/settings", label: "Settings", icon: SettingsIcon },
              ].map((tab) => (
                <li key={tab.href}>
                  <RailLink tab={tab} active={isActive(tab.href)} collapsed={collapsed} />
                </li>
              ))}
            </ul>
            <div
              className={`mt-3 rounded-2xl bg-sunken ${
                collapsed ? "flex flex-col items-center gap-1 p-1" : "p-3"
              }`}
            >
              <div className={`flex items-center ${collapsed ? "flex-col" : "justify-between"}`}>
                {collapsed ? null : (
                  <span className="text-[12px] font-medium text-ink-muted">
                    Testnet demo · no real money
                  </span>
                )}
                <div className={`flex items-center ${collapsed ? "flex-col" : ""}`}>
                  <ThemeToggle />
                  <NotificationBell align="left" />
                </div>
              </div>
              {collapsed ? null : (
                <div className="mt-2 [&>*]:w-full">
                  <WalletButton signIn />
                </div>
              )}
            </div>
          </div>
        </aside>
      </Tooltip.Provider>

      {/* ---------------------------------------------------------- phone top bar */}
      <header
        className="relative z-40 shrink-0 px-4 pt-4 pb-2 lg:hidden"
        data-testid="app-header"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 rounded-full bg-surface/95 py-1.5 pr-1.5 pl-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
          <Link
            href="/app"
            className="flex min-h-11 min-w-0 items-center text-ink"
            aria-label="Modalis home"
          >
            <ModalisLogo size={24} className="max-[359px]:[&>span]:hidden" />
          </Link>
          <div className="flex items-center gap-1">
            <CommandPalette
              items={palette}
              triggerClassName="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
              trigger={<SearchIcon />}
            />
            <NotificationBell />
            <Link
              href="/app/add-money"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink"
            >
              <PlusIcon />
              <span className="max-[359px]:sr-only">Add money</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------- phone tab bar */}
      <nav
        data-testid="app-dock"
        aria-label="App"
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[24px] bg-surface/95 p-1.5 shadow-[var(--shadow-float)] backdrop-blur-xl">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <li key={tab.href} className="relative">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`${DOCK_ITEM} ${active ? "text-panel-ink" : "text-ink-soft hover:bg-sunken hover:text-ink"}`}
                >
                  {active ? (
                    <motion.span
                      layoutId="dock-active"
                      aria-hidden
                      className="absolute inset-0 rounded-[18px] bg-panel"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  ) : null}
                  <span className="relative">
                    <tab.icon active={active} />
                  </span>
                  <span className="relative">{tab.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <NavigationSheet
              title="More"
              bottom
              triggerClassName={`${DOCK_ITEM} w-full ${inMore ? "bg-panel text-panel-ink" : "text-ink-soft hover:bg-sunken hover:text-ink"}`}
              trigger={
                <>
                  <MoreIcon />
                  More
                </>
              }
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sunken p-3">
                <span className="text-xs font-medium text-ink-muted">
                  Testnet demo · no real money
                </span>
                <div className="flex items-center gap-1">
                  <ThemeToggle />
                  <WalletButton signIn />
                </div>
              </div>
              <nav aria-label="More pages">
                {groups.map((group) => (
                  <NavGroup
                    key={group.title}
                    group={group}
                    isActive={isActive}
                    className="mt-4"
                  />
                ))}
              </nav>
            </NavigationSheet>
          </li>
        </ul>
      </nav>
    </>
  );
}

const DOCK_ITEM =
  "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[18px] px-1 text-[11.5px] font-semibold leading-none transition-colors";

/** A label to the right of a rail icon, only while the sidebar is folded. */
function RailTip({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: React.ReactElement;
}) {
  return (
    <Tooltip.Root disabled={!enabled}>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={14} className="z-[60]">
          <Tooltip.Popup className="rail-tip rounded-lg bg-panel px-2.5 py-1.5 text-[12.5px] font-semibold whitespace-pre text-panel-ink shadow-[var(--shadow-float)]">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** One sidebar row: icon + label when open, a square icon button with a tooltip when folded. */
function RailLink({
  tab,
  active,
  collapsed,
  nested = false,
}: {
  tab: Tab;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
}) {
  const Icon = tab.icon;
  return (
    <RailTip label={tab.label} enabled={collapsed}>
      <Link
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={`group/link relative flex min-h-[40px] items-center gap-3 rounded-xl text-[14.5px] transition-colors ${
          collapsed ? "mx-auto w-10 justify-center" : nested ? "px-2.5" : "px-3"
        } ${active ? "font-semibold text-ink" : "font-medium text-ink-soft hover:bg-sunken/70 hover:text-ink"}`}
      >
        {active ? (
          <motion.span
            layoutId="side-active"
            aria-hidden
            className="absolute inset-0 rounded-xl bg-sunken"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <span className="absolute top-1/2 -left-px h-5 w-[3px] -translate-y-1/2 rounded-full bg-ink" />
          </motion.span>
        ) : null}
        <span className="relative">
          <Icon active={active} />
        </span>
        <span className={collapsed ? "sr-only" : "relative flex-1 truncate"}>{tab.label}</span>
        {active && !collapsed ? (
          <span aria-hidden className="relative text-ink-muted">
            <ChevronRightIcon />
          </span>
        ) : null}
      </Link>
    </RailTip>
  );
}

/** A titled group that folds open and shut, with a guide line down its pages. */
function FoldGroup({
  group,
  isActive,
  collapsed,
}: {
  group: Group;
  isActive: (href: string) => boolean;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(true);
  const id = `fold-${group.title.toLowerCase().replace(/\W+/g, "-")}`;
  const holdsActive = group.tabs.some((tab) => isActive(tab.href));
  if (collapsed)
    return (
      <div className="mt-3 border-t border-line pt-3">
        <ul aria-label={group.title} className="space-y-0.5">
          {group.tabs.map((tab) => (
            <li key={tab.href}>
              <RailLink tab={tab} active={isActive(tab.href)} collapsed />
            </li>
          ))}
        </ul>
      </div>
    );
  const expanded = open || holdsActive;
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setOpen(!expanded)}
        className="flex min-h-[32px] w-full items-center justify-between rounded-lg px-3 text-ink-muted transition-colors hover:text-ink"
      >
        <span className="eyebrow">{group.title}</span>
        <span className={`transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}>
          <ChevronDownIcon />
        </span>
      </button>
      {expanded ? (
        <ul
          id={id}
          className="relative mt-0.5 ml-[21px] space-y-0.5 border-l border-line pl-2"
        >
          {group.tabs.map((tab) => (
            <li key={tab.href}>
              <RailLink tab={tab} active={isActive(tab.href)} collapsed={false} nested />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NavGroup({
  group,
  isActive,
  className = "",
}: {
  group: Group;
  isActive: (href: string) => boolean;
  className?: string;
}) {
  const id = `nav-${group.title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className={className}>
      <h2 id={id} className="eyebrow px-3 pb-1.5 text-ink-muted">
        {group.title}
      </h2>
      <ul aria-labelledby={id} className="space-y-0.5">
        {group.tabs.map((tab) => (
          <li key={tab.href}>
            <SideLink tab={tab} active={isActive(tab.href)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SideLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[14.5px] transition-colors ${
        active
          ? "bg-sunken font-semibold text-ink"
          : "font-medium text-ink-soft hover:bg-sunken hover:text-ink"
      }`}
    >
      <Icon active={active} />
      <span className="flex-1">{tab.label}</span>
      {active ? <ChevronRightIcon /> : null}
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

function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
      <rect x="2.8" y="3.5" width="14.4" height="13" rx="3" {...stroke()} />
      <path d="M7.8 3.5v13" {...stroke()} />
      <path d={collapsed ? "m11 8.2 1.8 1.8-1.8 1.8" : "m13 8.2-1.8 1.8 1.8 1.8"} {...stroke()} />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
      <path d="m8 5 5 5-5 5" {...stroke()} />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden>
      <path d="m5 8 5 5 5-5" {...stroke()} />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="4.5" cy="10" r="1.3" fill="currentColor" />
      <circle cx="10" cy="10" r="1.3" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1.3" fill="currentColor" />
    </svg>
  );
}

function PlusCircleIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="7" {...stroke(active)} />
      <path d="M10 6.8v6.4M6.8 10h6.4" {...stroke(active)} />
    </svg>
  );
}

function WithdrawIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M10 3.5v9M6.5 9 10 12.5 13.5 9" {...stroke(active)} />
      <path d="M4 16.5h12" {...stroke(active)} />
    </svg>
  );
}

function SendIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M3.5 10 16.5 3.5 13 16.5l-3-5z" {...stroke(active)} />
      <path d="m10 11.5 6.5-8" {...stroke(active)} />
    </svg>
  );
}

function GiftIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <rect x="3" y="7.5" width="14" height="9" rx="1.6" {...stroke(active)} />
      <path d="M10 7.5v9M3 11h14" {...stroke(active)} />
      <path d="M10 7.5C8.5 4 5.5 4.5 6.5 6.5 7 7.4 10 7.5 10 7.5Zm0 0c1.5-3.5 4.5-3 3.5-1-.5.9-3.5 1-3.5 1Z" {...stroke(active)} />
    </svg>
  );
}

function BellIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.2 1.5H3.8z" {...stroke(active)} />
      <path d="M8.3 17h3.4" {...stroke(active)} />
    </svg>
  );
}
