import { ImageResponse } from "next/og";

export const alt = "Lookalike: shop by photo";
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
        <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>Lookalike</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -3 }}>
            Found something you love? Find its lookalikes.
          </div>
          <div style={{ fontSize: 34, color: "#a3a3a3" }}>
            Upload a photo and shop visually similar fashion.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
