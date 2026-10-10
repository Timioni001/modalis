"use client";

/**
 * The page's backdrop.
 *
 * Public pages open on a slow, living mesh gradient, the treatment Stripe made the standard for
 * money products: a field of colour that moves like liquid behind the headline and dissolves into
 * the page as you scroll. It is a WebGL shader (Paper Shaders), capped in resolution so a phone
 * renders it cheaply, frozen for anyone who asks for reduced motion, and recoloured per theme.
 *
 * The app's own pages get a quieter version of the same idea: two still pools of light at the top,
 * plain CSS, nothing moving while somebody is looking at their money.
 */
import { useEffect, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";

/* Mostly canvas, so the headline always sits on calm ground, with the signal lime, a deep teal
   and an indigo moving through it. */
const MESH = {
  dark: ["#0b0b0d", "#5a8512", "#0b0b0d", "#0e6259", "#34309a", "#0b0b0d"],
  light: ["#ffffff", "#d6f58a", "#ffffff", "#addfff", "#d9cfff", "#ffffff"],
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

  if (variant === "app") {
    return <div aria-hidden className="ambient-quiet" />;
  }

  return (
    <div aria-hidden className="ambient-mesh">
      <MeshGradient
        className="h-full w-full"
        colors={MESH[theme]}
        distortion={0.85}
        swirl={0.35}
        speed={reduced ? 0 : 0.18}
        grainMixer={0}
        grainOverlay={theme === "dark" ? 0.12 : 0.06}
        minPixelRatio={1}
        maxPixelCount={1280 * 800}
      />
    </div>
  );
}
