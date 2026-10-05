"use client";

/**
 * Which frame a page gets.
 *
 * Two different products share this app and should not share a chrome. The PUBLIC site is a
 * marketing surface: wide, a product menu, a full footer. The APP is somebody's money: a narrow
 * task bar, their plan's status always visible, and no marketing in the way of it.
 *
 * Deciding here rather than in each page keeps a route from accidentally shipping the wrong one.
 */
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteNav } from "./site-nav";
import { SiteFooter } from "./site-footer";
import { AppNav } from "./app-nav";

/** Routes that are somebody's money rather than a marketing page. */
const APP_PREFIXES = ["/app", "/onboarding", "/plan"];

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const inApp = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (inApp) {
    return (
      <div className="flex min-h-screen flex-col bg-surface">
        <AppNav />
        <main id="main" className="flex-1">
          {children}
        </main>
        <AppFootnote />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * The app's footer is one line, not a sitemap.
 *
 * Somebody checking their balance does not need a link to the careers page, but they are entitled
 * to the disclosure on every screen where they see a number.
 */
function AppFootnote() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-6 text-xs text-ink-muted">
        <p className="max-w-xl">
          A technical demonstration. Modalis is not an investment adviser, broker or fund, no
          return is promised, and the demo investments are not real assets.
        </p>
        <nav className="flex gap-4" aria-label="Legal">
          <a className="hover:text-ink" href="/legal/risk">
            Risks
          </a>
          <a className="hover:text-ink" href="/legal/terms">
            Terms
          </a>
          <a className="hover:text-ink" href="/legal/privacy">
            Privacy
          </a>
        </nav>
      </div>
    </footer>
  );
}
