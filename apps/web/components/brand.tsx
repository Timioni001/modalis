/**
 * The Modalis identity.
 *
 * The mark is a staircase inside a rounded boundary, and both halves mean something specific:
 *
 *   The STAIRCASE is the product — a goal reached one regular contribution at a time, which is
 *   what Modalis actually does. Not a soaring growth curve, because this product does not promise
 *   growth; a stair is deliberate, repeatable and entirely within the person's control.
 *
 *   The BOUNDARY is the plan — the limits they approved. The staircase rises inside it and never
 *   touches the edge, which is the whole security model drawn in two shapes: Modalis can move
 *   within the limits and cannot leave them.
 *
 * Built from strokes on a 32-unit grid so it stays legible at 16px in a browser tab, reproduces
 * in one colour, and works on light or dark without a second version. `currentColor` throughout,
 * so it inherits wherever it is placed.
 */
import type { SVGProps } from "react";

/** The mark on its own: favicon, app icon, a tight corner. */
export function ModalisMark({
  size = 28,
  title,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {/* The limits you set. */}
      <rect
        x="2.9"
        y="2.9"
        width="26.2"
        height="26.2"
        rx="8.4"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/*
        The plan, climbing inside them.

        Three treads and two risers, starting and ENDING on a horizontal. An earlier version ended
        on a riser and the whole mark read as a descending zigzag — the eye takes the last stroke
        as the direction of travel. Ending flat is what makes it read as a stair going up.

        The stair is drawn heavier than its frame so it stays the subject at small sizes.
      */}
      <path
        d="M9 21.4H14.2V16H19.4V10.6H23"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The full lockup.
 *
 * The wordmark is set in the product's own typeface at a tightened tracking rather than drawn as
 * outlines, so it stays crisp at every size and matches the interface it sits above.
 */
export function ModalisLogo({
  size = 26,
  className = "",
  showWord = true,
}: {
  size?: number;
  className?: string;
  showWord?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <ModalisMark size={size} />
      {showWord ? (
        <span
          className="display font-bold"
          style={{ fontSize: size * 0.72, lineHeight: 1, letterSpacing: "-0.02em" }}
        >
          Modalis
        </span>
      ) : null}
    </span>
  );
}
