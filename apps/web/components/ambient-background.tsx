"use client";

/**
 * The page's backdrop.
 *
 * Light falling from above the page: soft beams that slowly turn and breathe, the treatment Linear
 * and Vercel use, rather than a wash of colour. It keeps the page near-monochrome, so the one lime
 * accent and the numbers stay the brightest things on screen, with a faint lime thread in the light.
 *
 * A WebGL shader (Paper Shaders' God Rays), capped in resolution so a phone renders it cheaply,
 * still for anyone who asks for reduced motion, and re-lit per theme. App pages get the same light,
 * dimmer and pinned to the top of the screen.
 */
import { useEffect, useState } from "react";
import { GodRays } from "@paper-design/shaders-react";

type Theme = "dark" | "light";

/* Dark: white light with a lime thread, added onto the canvas. Light: graphite shadows on white. */
const LIGHT = {
  dark: {
    colorBack: "#0b0b0d",
    colorBloom: "#e8e8ea",
    colors: ["#ffffff14", "#ffffff2b", "#c8f25026", "#ffffff1c"],
    bloom: 1,
  },
  light: {
    colorBack: "#ffffff",
    colorBloom: "#ffffff",
    colors: ["#0e0e100a", "#0e0e1014", "#7fa31a17", "#0e0e100d"],
    bloom: 0,
  },
} as const;

function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("light");
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

  const light = LIGHT[theme];
  const app = variant === "app";
  return (
    <div aria-hidden className={app ? "ambient-mesh ambient-mesh-app" : "ambient-mesh"}>
      <GodRays
        className="h-full w-full"
        colorBack={light.colorBack}
        colorBloom={light.colorBloom}
        colors={[...light.colors]}
        bloom={light.bloom}
        offsetX={0}
        offsetY={-0.9}
        density={0.22}
        spotty={0.35}
        midSize={0.25}
        midIntensity={app ? 0.3 : 0.5}
        intensity={app ? 0.4 : 0.6}
        speed={reduced ? 0 : 0.5}
        minPixelRatio={1}
        maxPixelCount={1280 * 800}
      />
    </div>
  );
}
