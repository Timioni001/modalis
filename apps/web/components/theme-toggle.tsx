"use client";

/**
 * Light / dark switch.
 *
 * The choice is stored in this browser only (it is a display preference, nothing more). With no
 * stored choice the page follows the device, and keeps following it if the device changes.
 * `THEME_SCRIPT` runs before the first paint so a dark-mode visitor never sees a white flash.
 */
import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "modalis-theme";

export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${KEY}");var d=c==="dark"||(c!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemDark());
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let stored: ThemeChoice = "system";
    try {
      const v = localStorage.getItem(KEY);
      if (v === "light" || v === "dark") stored = v;
    } catch {}
    setChoice(stored);
    setDark(document.documentElement.dataset.theme === "dark");

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let current: string | null = null;
      try {
        current = localStorage.getItem(KEY);
      } catch {}
      if (current !== "light" && current !== "dark") {
        apply("system");
        setDark(media.matches);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const choose = useCallback((next: ThemeChoice) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
    setChoice(next);
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  return { choice, dark, choose };
}

/** One round button: shows the moon in light mode and the sun in dark mode. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { dark, choose } = useTheme();
  return (
    <button
      type="button"
      onClick={() => choose(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sunken hover:text-ink ${className}`}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** Three-way choice for the settings page, including "match my device". */
export function ThemeChooser() {
  const { choice, choose } = useTheme();
  const options: { id: ThemeChoice; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "Match my device" },
  ];
  return (
    <div role="radiogroup" aria-label="Appearance" className="inline-flex flex-wrap gap-1 rounded-full bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={choice === o.id}
          onClick={() => choose(o.id)}
          className={`min-h-[40px] rounded-full px-4 text-[13.5px] font-semibold transition-colors ${
            choice === o.id ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-ink-soft hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
