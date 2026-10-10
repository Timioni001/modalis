"use client";

/**
 * The page's backdrop.
 *
 * Public pages open on a slow, living mesh gradient, the treatment Stripe made the standard for
 * money products: a field of colour that moves like liquid behind the headline and dissolves into
 * the page as you scroll. It is a WebGL shader (Paper Shaders), capped in resolution so a phone
 * renders it cheaply, frozen for anyone who asks for reduced motion, and recoloured per theme.
 *
 * The app's own pages get the same gradient, softer and pinned behind the top of the screen, so the
 * whole product moves the same way without competing with somebody's numbers.
 */
import { useEffect, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";

/* Mostly canvas, so the headline always sits on calm ground, with the signal lime, a deep teal
   and an indigo moving through it. */
const MESH = {
  public: {
    dark: ["#0b0b0d", "#46680f", "#0b0b0d", "#0e5a52", "#2f2b8c", "#0b0b0d"],
    light: ["#ffffff", "#d6f58a", "#ffffff", "#addfff", "#d9cfff", "#ffffff"],
  },
  app: {
    dark: ["#0b0b0d", "#3a5410", "#0b0b0d", "#0b3f3a", "#23206a", "#0b0b0d"],
    light: ["#f4f4f5", "#e2f5a8", "#f4f4f5", "#c9e8ff", "#e2dbff", "#f4f4f5"],
  },
};

function useTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    read();
    const watch = new MutationObserver(read);
    watch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  return theme;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return reduced;
}

export function AmbientBackground({ variant = "app" }: { variant?: "public" | "app" }) {
  const theme = useTheme();
  const reduced = usePrefersReducedMotion();

  return (
    <div aria-hidden className={variant === "public" ? "ambient-mesh" : "ambient-mesh ambient-mesh-app"}>
      <MeshGradient
        className="h-full w-full"
        colors={MESH[variant][theme]}
        distortion={0.85}
        swirl={0.3}
        speed={reduced ? 0 : variant === "public" ? 0.5 : 0.35}
        grainMixer={0}
        grainOverlay={theme === "dark" ? 0.12 : 0.06}
        minPixelRatio={1}
        maxPixelCount={1280 * 800}
      />
    </div>
  );
}
