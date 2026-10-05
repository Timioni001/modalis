import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortfolioProvider } from "@/components/portfolio-provider";

export const metadata: Metadata = {
  title: "Your money",
  // Nothing behind a sign-in belongs in a search result.
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <PortfolioProvider>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">{children}</div>
    </PortfolioProvider>
  );
}
