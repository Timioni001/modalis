import type { ReactNode } from "react";
import { PortfolioProvider } from "@/components/portfolio-provider";

export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return (
    <PortfolioProvider>
      <div className="mx-auto max-w-6xl px-5 py-10">{children}</div>
    </PortfolioProvider>
  );
}
