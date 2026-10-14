import type { MetadataRoute } from "next";

/** Makes Modalis installable from the browser ("Add to Home Screen"), opening straight into the app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Modalis",
    short_name: "Modalis",
    description: "A clear plan for every goal.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f4f4f5",
    theme_color: "#f4f4f5",
    categories: ["finance"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
