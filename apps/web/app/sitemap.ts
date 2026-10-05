import type { MetadataRoute } from "next";

/** The public pages only. A person's plan is not a public page. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const updated = new Date();

  return [
    { url: `${base}/`, lastModified: updated, priority: 1 },
    { url: `${base}/how-it-works`, lastModified: updated, priority: 0.8 },
    { url: `${base}/security`, lastModified: updated, priority: 0.8 },
    { url: `${base}/contact`, lastModified: updated, priority: 0.4 },
    { url: `${base}/legal/risk`, lastModified: updated, priority: 0.5 },
    { url: `${base}/legal/terms`, lastModified: updated, priority: 0.3 },
    { url: `${base}/legal/privacy`, lastModified: updated, priority: 0.3 },
    { url: `${base}/legal/acceptable-use`, lastModified: updated, priority: 0.3 },
  ];
}
