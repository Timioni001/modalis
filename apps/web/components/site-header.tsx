"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";

const NAV = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/portfolio/risk", label: "Risk" },
  { href: "/portfolio/activity", label: "Activity" },
  { href: "/portfolio/scenarios", label: "What if?" },
  { href: "/settings", label: "Settings" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const onLanding = pathname === "/";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="text-[17px] font-semibold tracking-tight text-ink">
          Modalis
        </Link>

        {!onLanding ? (
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-ink-soft hover:bg-surface-sunken"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
