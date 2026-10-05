import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Monda } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { publicConfig } from "@/lib/public-config";
import { SiteChrome } from "@/components/site-chrome";

/**
 * Two faces, each doing a job the other can't.
 *
 * MONDA sets the display type and the wordmark. It is wider and more geometric than a default
 * grotesque, which is what gives the brand its character at 5rem — and it is SIL OFL licensed, so
 * it can actually ship. (Most of the "nextgen" display faces floating around are personal-use
 * only; those are not shippable in a product regardless of how they look.)
 *
 * GEIST sets everything else, and every number without exception. Money has to sit in columns
 * that line up and not twitch as a live figure changes, which needs tabular figures — so amounts
 * stay on the face that has them, even inside a Monda headline.
 *
 * Both are self-hosted at build time rather than linked from a font CDN, so nothing about a
 * visitor is sent to a third party when the page loads.
 */
const display = Monda({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-display-face",
  display: "swap",
});

const SITE_NAME = "Modalis";
const TAGLINE = "Turn your goal into a plan that manages itself.";
const DESCRIPTION =
  "Tell Modalis what you're saving for. It builds a plan around your goal, keeps your money " +
  "inside the limits you set, and tells you plainly whether you're on track.";

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE_NAME} — ${TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: DESCRIPTION },
  robots: {
    index: true,
    follow: true,
    // Nothing behind a sign-in should ever be indexed, and the route config repeats this per-path.
    nocache: true,
  },
  category: "finance",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e13" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cfg = publicConfig();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable}`}>
      <body className="min-h-screen bg-surface text-ink antialiased">
        {/* The first stop for a keyboard or screen-reader user on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-surface"
        >
          Skip to content
        </a>
        <Providers
          environmentId={cfg.dynamicEnvironmentId}
          chainId={cfg.chainId}
          networkName={cfg.networkName}
          rpcUrl={cfg.rpcUrl}
          explorerUrl={cfg.explorerUrl}
          demoMode={cfg.demoMode}
        >
          <SiteChrome>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
