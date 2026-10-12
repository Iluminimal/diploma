import { ImageResponse } from "next/og";

export const alt = "Angel: shop by photo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card shown when a link to the site is shared and the page has no photo of its own. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0a0a0a",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 44, fontWeight: 600, letterSpacing: -1 }}>
          <svg width="56" height="56" viewBox="0 0 32 32" fill="none" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="16" cy="5" rx="6" ry="2" transform="rotate(-10 16 5)" strokeWidth="1.5" />
            <path d="M6.5 28.5 16 10.5l9.5 18" strokeWidth="2.4" />
            <path d="M10.8 22.6Q16 19.8 21.2 22.6" strokeWidth="2.4" />
          </svg>
          Angel
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3 }}>
            Shop by photo. Find the pieces that match.
          </div>
          <div style={{ fontSize: 34, color: "#a3a3a3" }}>
            Show Angel a look you love and shop visually similar fashion.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
