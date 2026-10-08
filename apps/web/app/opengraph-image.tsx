import { ImageResponse } from "next/og";

/**
 * The share card.
 *
 * Rendered at build/request time rather than shipped as a PNG, so it cannot drift from the
 * product's own words. It carries the mark, the positioning line and the one claim worth leading
 * with — and nothing that would need a disclaimer, because a share card is the one surface that
 * travels without its context.
 *
 * System fonts only: an edge-rendered image that fetches a typeface is an image that fails when
 * the font host does.
 */
export const alt = "Modalis — a clear plan for every goal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#10131a",
          color: "#f7f7f5",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="52" height="52" viewBox="0 0 32 32" fill="none">
            <rect
              x="2.9"
              y="2.9"
              width="26.2"
              height="26.2"
              rx="8.4"
              stroke="#f7f7f5"
              strokeWidth="2"
            />
            <path
              d="M9 21.4H14.2V16H19.4V10.6H23"
              stroke="#f7f7f5"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: "-0.03em" }}>Modalis</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 74,
            fontWeight: 600,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            maxWidth: 980,
          }}
        >
          <span>A clear plan</span>
          <span style={{ color: "#9aa1ad" }}>for every goal.</span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 24,
            color: "#9aa1ad",
            borderTop: "1px solid #282d38",
            paddingTop: 28,
          }}
        >
          <span>Modalis recommends. Your rules decide.</span>
          <span>Settles on Monad</span>
        </div>
      </div>
    ),
    size,
  );
}
