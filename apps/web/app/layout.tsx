import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { publicConfig } from "@/lib/public-config";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Modalis — Your goals. Your money. Managed.",
  description:
    "Goal-based wealth management, programmed on Monad. Tell Modalis what your money needs to " +
    "accomplish; it builds a portfolio around the goal and manages it within a mandate you approve.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cfg = publicConfig();
  return (
    <html lang="en">
      <body className="min-h-screen bg-white antialiased">
        <Providers
          environmentId={cfg.dynamicEnvironmentId}
          chainId={cfg.chainId}
          networkName={cfg.networkName}
          rpcUrl={cfg.rpcUrl}
          explorerUrl={cfg.explorerUrl}
          demoMode={cfg.demoMode}
        >
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
