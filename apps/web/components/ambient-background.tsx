"use client";

/**
 * The page's backdrop.
 *
 * The default is a topographic map of slowly shifting terrain: hairline elevation lines, with every
 * fifth line drawn in the signal lime like the index line on a survey map. A plan is a route across
 * ground you can't fully see yet, so the page draws the ground. It reads the same in both themes,
 * because it is line work, not a wash of colour.
 *
 * Two alternatives can be previewed with ?bg=grain (a grainy wave of colour) or ?bg=silk (tonal
 * flowing silk) while the choice is made. All are WebGL shaders (Paper Shaders), capped in
 * resolution for phones and still for anyone who asks for reduced motion.
 */
import { useEffect, useState } from "react";
import { GrainGradient, ShaderMount, Warp } from "@paper-design/shaders-react";

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

/*
 * Contours: a topographic map of slowly shifting terrain. Hairline elevation lines, with every fifth
 * line (the "index" line on a survey map) drawn a touch stronger in the signal lime.
 */
const CONTOUR_SHADER = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec4 u_back;
uniform vec4 u_line;
uniform vec4 u_index;
uniform float u_density;
out vec4 fragColor;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / max(u_resolution.x, u_resolution.y) * 2.2;
  float t = u_time * 0.04;
  float h = snoise(uv * 1.1 + vec2(t, -t * 0.6));
  h += 0.45 * snoise(uv * 2.3 - vec2(t * 0.7, t * 0.4));
  float f = h * u_density;

  float w = fwidth(f);
  float d = abs(fract(f + 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.0, w * 1.2, d);
  float band = mod(floor(f + 0.5), 5.0);
  float isIndex = 1.0 - step(0.5, band);

  vec4 c = mix(u_line, u_index, isIndex);
  vec3 col = mix(u_back.rgb, c.rgb, line * c.a);
  fragColor = vec4(col, 1.0);
}
`;

const hex = (h: string): [number, number, number, number] => {
  const n = h.replace("#", "");
  const a = n.length === 8 ? parseInt(n.slice(6, 8), 16) / 255 : 1;
  return [parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255, a];
};

const CONTOURS = {
  dark: { back: "#0b0b0d", line: "#ffffff1c", index: "#c8f2506e" },
  light: { back: "#ffffff", line: "#0e0e101a", index: "#6f9a0e7a" },
};

const GRAIN = {
  dark: { back: "#0b0b0d", colors: ["#c8f250", "#1aa598", "#4b46d6"] },
  light: { back: "#f6f6f4", colors: ["#c8f250", "#7fd3ff", "#b9a8ff"] },
};

const SILK = {
  dark: ["#0b0b0d", "#1c1c20", "#0b0b0d", "#2b3a12"],
  light: ["#ffffff", "#e9e9ec", "#ffffff", "#e6f4c4"],
};

export function AmbientBackground({ variant = "app" }: { variant?: "public" | "app" }) {
  const theme = useTheme();
  const reduced = usePrefersReducedMotion();
  const [style, setStyle] = useState("contours");
  useEffect(() => {
    setStyle(new URLSearchParams(location.search).get("bg") ?? "contours");
  }, []);

  const app = variant === "app";
  const sizing = { minPixelRatio: 1, maxPixelCount: 1280 * 800, className: "h-full w-full" };

  let shader;
  if (style === "grain") {
    const g = GRAIN[theme];
    shader = (
      <GrainGradient
        {...sizing}
        colorBack={g.back}
        colors={g.colors}
        softness={0.7}
        intensity={0.35}
        noise={0.3}
        shape="wave"
        speed={reduced ? 0 : 0.6}
      />
    );
  } else if (style === "silk") {
    shader = (
      <Warp
        {...sizing}
        colors={SILK[theme]}
        proportion={0.45}
        softness={1}
        distortion={0.2}
        swirl={0.6}
        swirlIterations={8}
        shapeScale={0.12}
        shape="stripes"
        rotation={-20}
        speed={reduced ? 0 : 0.6}
      />
    );
  } else {
    const c = CONTOURS[theme];
    shader = (
      <ShaderMount
        {...sizing}
        fragmentShader={CONTOUR_SHADER}
        uniforms={{ u_back: hex(c.back), u_line: hex(c.line), u_index: hex(c.index), u_density: 7 }}
        speed={reduced ? 0 : 1}
      />
    );
  }

  return (
    <div aria-hidden className={app ? "ambient-mesh ambient-mesh-app" : "ambient-mesh"}>
      {shader}
    </div>
  );
}
