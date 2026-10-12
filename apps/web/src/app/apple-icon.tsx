import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 32 32" fill="none" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="16" cy="5" rx="6" ry="2" transform="rotate(-10 16 5)" strokeWidth="1.5" />
          <path d="M6.5 28.5 16 10.5l9.5 18" strokeWidth="2.4" />
          <path d="M10.8 22.6Q16 19.8 21.2 22.6" strokeWidth="2.4" />
        </svg>
      </div>
    ),
    size,
  );
}
