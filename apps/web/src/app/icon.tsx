import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** The favicon: Angel's mark (a halo over an A) in white on black. */
export default function Icon() {
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
          borderRadius: 8,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="16" cy="5.5" rx="6.5" ry="2.4" strokeWidth="2.4" />
          <path d="M6.5 28 16 11l9.5 17" strokeWidth="3.4" />
          <path d="M11 21.5h10" strokeWidth="3.4" />
        </svg>
      </div>
    ),
    size,
  );
}
