"use client";

/**
 * Learning cards: a small "?" beside a term that opens a two-sentence explanation in place.
 * The words are the app's own; no finance or crypto jargon is used to explain jargon.
 */
import { useEffect, useId, useRef, useState } from "react";

export const GLOSSARY = {
  drift: {
    term: "Drift",
    text: "How far a holding has moved from the share your plan wants it to be. Prices move every day, so a little drift is normal; Modalis only acts when it passes your limit.",
  },
  available: {
    term: "Kept available",
    text: "The part of your plan held as cash-like money, so you can take it out quickly without selling anything. Your plan never lets it fall below the floor you chose.",
  },
  target: {
    term: "Target and range",
    text: "The target is the share of your plan a holding should be. The range around it is how far it may wander before Modalis suggests bringing it back.",
  },
  biggestFall: {
    term: "Biggest fall",
    text: "The largest drop in value you told us you could live with. Your plan is built so that a normal bad patch stays inside it.",
  },
  adjustment: {
    term: "Adjustment",
    text: "A small trade that brings your plan back to its targets. Your plan's contract checks every adjustment against your limits before it can happen.",
  },
  fee: {
    term: "Network fee",
    text: "Every action on Monad costs a tiny fee in MON, usually a fraction of a cent. On the test network, MON is free from the faucet.",
  },
  confirmed: {
    term: "Confirmed",
    text: "Your action is recorded in a block on Monad and can't be undone or changed. Monad makes a new block about every half second.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

export function Explain({ term }: { term: GlossaryKey }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const entry = GLOSSARY[term];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What does "${entry.term}" mean?`}
        onClick={() => setOpen((o) => !o)}
        className="ml-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-sunken text-[11px] font-bold text-ink-muted hover:bg-line hover:text-ink"
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-2xl bg-panel p-3.5 text-left text-[13px] font-normal leading-relaxed text-panel-ink shadow-[var(--shadow-lift)]"
        >
          <span className="block font-semibold">{entry.term}</span>
          <span className="mt-1 block text-panel-soft">{entry.text}</span>
        </span>
      ) : null}
    </span>
  );
}
