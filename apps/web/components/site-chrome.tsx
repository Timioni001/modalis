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
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { ModalisLogo } from "./brand";
import { WalletButton } from "./wallet-button";
import { SiteNav } from "./site-nav";
import { SiteFooter } from "./site-footer";
import { AppNav } from "./app-nav";
import { AmbientBackground } from "./ambient-background";

/** Routes that are somebody's money rather than a marketing page. */
const APP_PREFIXES = ["/app", "/onboarding", "/plan"];

/**
 * Routes where someone is making a plan, not managing one.
 *
 * They get the mark and nothing else. Tabs to Money, Plan and Activity are meaningless to someone
 * who has no plan yet, and offering a way out of a five-step form is a way to lose them halfway.
 */
const FOCUSED = ["/onboarding", "/plan"];

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const inApp = APP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const focused = FOCUSED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  useEffect(() => {
    if (inApp && !focused) document.getElementById("main")?.scrollTo(0, 0);
  }, [pathname, inApp, focused]);

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ type: "spring", stiffness: 360, damping: 32 }}
    >
      {focused ? (
        <div className="isolate flex min-h-screen flex-col bg-canvas">
          <AmbientBackground />
          <FocusedNav />
          <main id="main" className="flex-1">
            {children}
          </main>
          <AppFootnote />
        </div>
      ) : inApp ? (
        // Reserve real viewport space for the dock. Forms scroll above it, never behind it.
        <div className="isolate flex h-dvh flex-col overflow-hidden bg-canvas pb-[calc(88px+env(safe-area-inset-bottom))] lg:h-auto lg:min-h-screen lg:overflow-visible lg:pb-0 lg:pl-[256px] print:h-auto print:overflow-visible print:pb-0 print:pl-0">
          <AmbientBackground />
          <AppNav />
          <main
            id="main"
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain lg:overflow-visible print:overflow-visible"
          >
            {children}
            <AppFootnote />
          </main>
        </div>
      ) : (
        // The public site is white with grey cards; the app is grey with white cards.
        <div className="relative isolate flex min-h-screen flex-col bg-surface">
          <AmbientBackground variant="public" />
          <SiteNav />
          <main id="main" className="flex-1">
            {children}
          </main>
          {pathname === "/demo" ? <AppFootnote /> : <SiteFooter />}
        </div>
      )}

      {/*
        Confirmations, not decoration. A toast is used only where something actually happened and
        the person has already moved on from the control that caused it — a sent transaction, a
        copied address. Anything they are waiting on stays on the screen instead.
      */}
      <Toaster
        position="bottom-center"
        offset={inApp ? 76 : 20}
        toastOptions={{
          className: "modalis-toast",
          style: {
            borderRadius: "16px",
            border: "none",
            background: "var(--color-panel)",
            color: "var(--color-panel-ink)",
            boxShadow: "var(--shadow-float)",
            fontSize: "14px",
          },
        }}
      />
    </MotionConfig>
  );
}

/** Just the mark and the way to sign in. Nothing to click away with. */
function FocusedNav() {
  return (
    <header className="px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-full bg-surface/90 px-4 py-2.5 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <Link
          href="/"
          className="flex min-h-[44px] items-center text-ink"
          aria-label="Modalis home"
        >
          <ModalisLogo size={24} className="max-[359px]:[&>span]:hidden" />
        </Link>
        <div className="ml-auto">
          <WalletButton signIn />
        </div>
      </div>
    </header>
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
    <footer className="mt-12">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-8 text-xs text-ink-muted">
        <p className="max-w-xl">
          A technical demonstration. Modalis is not an investment adviser,
          broker or fund, no return is promised, and the demo investments are
          not real assets.
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
