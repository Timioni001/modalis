"use client";

/**
 * Three moving illustrations for the landing page, drawn in CSS and SVG (no image files, no
 * borrowed artwork). Each one stands for a single idea:
 *
 *   PillArc    a plan that keeps running on schedule
 *   DiscStack  money held in layers, each with its own limit
 *   CardFan    the investments in a plan, watched one by one
 *
 * They respect "reduce motion": with it on, each scene is drawn once and stays still.
 */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const PILL =
  "linear-gradient(180deg, #e3fb8f 0%, #a6d63b 22%, #4f7f1a 70%, #2c4a0d 100%)";

export function PillArc() {
  const still = useReducedMotion();
  const count = 11;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]" aria-hidden>
      <motion.div
        className="absolute inset-0"
        animate={still ? undefined : { rotate: [0, 360] }}
        transition={{ duration: 40, ease: "linear", repeat: Infinity }}
      >
        {Array.from({ length: count }, (_, i) => {
          // A half circle, top to bottom on the right, each pill pointing at the centre.
          const angle = -90 + (180 / (count - 1)) * i;
          return (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 h-[6.5%] w-[24%] origin-left"
              style={{ transform: `rotate(${angle}deg) translateX(58%) translateY(-50%)` }}
            >
              <motion.div
                className="h-full w-full rounded-full"
                style={{
                  background: PILL,
                  boxShadow:
                    "inset 0 2px 3px rgba(255,255,255,.55), inset 0 -3px 5px rgba(0,0,0,.35), 0 8px 18px -6px rgba(30,50,10,.45)",
                }}
                animate={still ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.96, 1, 0.96] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
              />
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

export function DiscStack() {
  const still = useReducedMotion();
  const discs = [-3, -2, -1, 1, 2, 3];
  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[420px] items-center justify-center" aria-hidden>
      <div className="absolute left-[22%] right-[22%] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-ink-muted/70 to-transparent" />
      {discs.map((d) => (
        <motion.div
          key={d}
          className="absolute left-1/2 top-1/2 h-[19%] w-[62%] rounded-[50%]"
          style={{
            x: "-50%",
            background:
              "radial-gradient(ellipse at 50% 30%, #9a9aa3 0%, #4a4a52 38%, #17171b 75%)",
            boxShadow:
              "inset 0 3px 2px rgba(255,255,255,.35), inset 0 -6px 12px rgba(0,0,0,.6), 0 14px 26px -12px rgba(0,0,0,.55)",
            zIndex: 10 - Math.abs(d),
          }}
          initial={{ y: `calc(-50% + ${d * 26}%)` }}
          animate={
            still
              ? { y: `calc(-50% + ${d * 26}%)` }
              : { y: [`calc(-50% + ${d * 22}%)`, `calc(-50% + ${d * 40}%)`, `calc(-50% + ${d * 22}%)`] }
          }
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/** An example plan, not a price feed: shares are the default balanced split, labelled as such. */
const CARDS = [
  { name: "Cash", note: "Kept available", share: "30%", mark: "$" },
  { name: "Bonds", note: "Steady growth", share: "30%", mark: "B" },
  { name: "Bitcoin", note: "Growth", share: "25%", mark: "₿" },
  { name: "Ethereum", note: "Growth", share: "15%", mark: "Ξ" },
];

export function CardFan() {
  const still = useReducedMotion();
  const [front, setFront] = useState(0);

  useEffect(() => {
    if (still) return;
    const t = setInterval(() => setFront((f) => (f + 1) % CARDS.length), 2600);
    return () => clearInterval(t);
  }, [still]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]" aria-hidden>
      {CARDS.map((card, i) => {
        const depth = (i - front + CARDS.length) % CARDS.length; // 0 = front
        return (
          <motion.div
            key={card.name}
            className="absolute left-1/2 top-1/2 flex aspect-[1.05] w-[58%] flex-col justify-between rounded-[26px] p-[6%] text-white"
            style={{
              background: "linear-gradient(160deg, #8c8c94 0%, #5d5d65 55%, #3c3c43 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 20px 40px -18px rgba(0,0,0,.55)",
              zIndex: CARDS.length - depth,
            }}
            animate={{
              x: `calc(-50% + ${depth * 7}%)`,
              y: `calc(-50% - ${depth * 6}%)`,
              rotate: depth * 7,
              scale: 1 - depth * 0.04,
              opacity: depth === CARDS.length - 1 ? 0.55 : 1,
            }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[19px] font-bold text-[#3c3c43]">
                {card.mark}
              </span>
              <div>
                <div className="text-[18px] font-semibold leading-tight">{card.name}</div>
                <div className="text-[13px] text-white/70">{card.note}</div>
              </div>
            </div>
            <div>
              <div className="numeric text-[34px] font-semibold leading-none">{card.share}</div>
              <div className="mt-1 text-[12px] text-white/70">of an example plan</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
