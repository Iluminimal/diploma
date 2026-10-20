import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: Angel-ийн тэмдэг (A үсгийн дээрх halo), хар дэвсгэр дээр цагаан. */
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
          <ellipse cx="16" cy="5" rx="6" ry="2" transform="rotate(-10 16 5)" strokeWidth="2" />
          <path d="M6.5 28.5 16 10.5l9.5 18" strokeWidth="3" />
          <path d="M10.8 22.6Q16 19.8 21.2 22.6" strokeWidth="3" />
        </svg>
      </div>
    ),
    size,
  );
}
