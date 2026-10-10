"use client";

/**
 * "Confirmed in 0.6s" — how long the network took to put a signed transaction in a block.
 *
 * Shown on every receipt the person signs. On Monad this is usually well under two seconds, and
 * saying so plainly is more convincing than a spinner that happens to be short.
 */
import { secondsLabel } from "@/lib/chain-client";
import { Explain } from "./explain";

export function ConfirmedIn({ ms }: { ms?: number | null }) {
  if (ms == null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">
      <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="none">
        <path d="M2.5 6.2l2.3 2.3 4.7-4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Confirmed in {secondsLabel(ms)}
      <Explain term="confirmed" />
    </span>
  );
}
