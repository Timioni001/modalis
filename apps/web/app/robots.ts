import type { MetadataRoute } from "next";

/**
 * Nothing behind a sign-in should ever appear in a search result.
 *
 * The API routes also send `X-Robots-Tag: noindex` in next.config, because robots.txt is a
 * request and a header is an instruction — a crawler that ignores one still honours the other.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/app", "/app/", "/onboarding", "/plan"],
    },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
