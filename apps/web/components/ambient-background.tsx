/**
 * The page's backdrop.
 *
 * Three slow pools of light drift behind the content, like the sky just before sunrise, and on the
 * public site a fan of plan trajectories rises across the top: the same shape the product draws for
 * a goal, with a small pulse of the signal colour travelling along each line. Fine grain over the
 * top stops the gradients from banding on cheap screens.
 *
 * Pure CSS and one inline SVG, so it costs no JavaScript and only animates transforms and dash
 * offsets. Reduced motion freezes it (see globals.css), and phones get fewer lines.
 */

/* Rising from bottom-left: the cautious path at the bottom, the hopeful one at the top. */
const TRAJECTORIES = [
  "M-40 860 C 360 820, 760 640, 1480 140",
  "M-40 860 C 420 830, 820 700, 1480 300",
  "M-40 860 C 460 840, 880 760, 1480 450",
  "M-40 860 C 500 850, 940 810, 1480 590",
  "M-40 860 C 540 860, 1000 850, 1480 720",
];

export function AmbientBackground({ lines = false }: { lines?: boolean }) {
  return (
    <div aria-hidden className="ambient">
      <div className="ambient-aurora">
        <span className="ambient-blob ambient-blob-1" />
        <span className="ambient-blob ambient-blob-2" />
        <span className="ambient-blob ambient-blob-3" />
      </div>

      {lines ? (
        <svg
          className="ambient-lines"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          {TRAJECTORIES.map((d, i) => (
            <g key={d} className={i % 2 ? "ambient-line-extra" : undefined}>
              <path d={d} className="ambient-line" vectorEffect="non-scaling-stroke" />
              <path
                d={d}
                pathLength={1000}
                className="ambient-pulse"
                style={{ animationDelay: `${i * -2.6}s`, animationDuration: `${11 + i * 1.7}s` }}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>
      ) : null}

      <div className="ambient-grain" />
    </div>
  );
}
