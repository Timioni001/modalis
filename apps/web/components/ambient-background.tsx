"use client";

/**
 * The page's backdrop: silk.
 *
 * Folds of tonal fabric drifting slowly behind the top of the page, almost the colour of the page
 * itself, with a faint lime sheen in one fold. Tonal rather than colourful, so it looks the same
 * quality on white and on black, and the lime button and the numbers stay the brightest things.
 *
 * A WebGL shader (Paper Shaders' Warp), capped in resolution so a phone renders it cheaply, still
 * for anyone who asks for reduced motion, and re-coloured per theme. App pages get the same silk,
 * pinned to the top of the screen on the app's grey canvas.
 */
import { useEffect, useState } from "react";
import { Warp } from "@paper-design/shaders-react";

type Theme = "dark" | "light";

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

const SILK = {
  public: {
    dark: ["#08080a", "#2c2c33", "#0b0b0d", "#4a4a54", "#0a0a0c", "#1f2a10"],
    light: ["#ffffff", "#e9e9ec", "#ffffff", "#e6f4c4"],
  },
  app: {
    dark: ["#08080a", "#232329", "#0b0b0d", "#3a3a42", "#0a0a0c", "#1a230d"],
    light: ["#f4f4f5", "#e2e2e6", "#f4f4f5", "#e4f2c2"],
  },
};

export function AmbientBackground({ variant = "app" }: { variant?: "public" | "app" }) {
  const theme = useTheme();
  const reduced = usePrefersReducedMotion();

  return (
    <div aria-hidden className={variant === "app" ? "ambient-mesh ambient-mesh-app" : "ambient-mesh"}>
      <Warp
        className="h-full w-full"
        colors={SILK[variant][theme]}
        proportion={0.45}
        softness={1}
        distortion={0.2}
        swirl={0.6}
        swirlIterations={8}
        shapeScale={0.12}
        shape="stripes"
        rotation={-20}
        speed={reduced ? 0 : 0.6}
        minPixelRatio={1}
        maxPixelCount={1280 * 800}
      />
    </div>
  );
}
