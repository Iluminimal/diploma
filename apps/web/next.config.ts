import type { NextConfig } from "next";

// The browser calls the API through this site (same origin), so the httpOnly refresh cookie is
// first-party. Server-side code reaches the API directly via API_INTERNAL_URL.
const apiOrigin =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
      // Product photos are served from this origin too: the browser reuses the connection the
      // page arrived on instead of opening (and warming up) a second one to the API.
      { source: "/media/:path*", destination: `${apiOrigin}/media/:path*` },
    ];
  },
};

export default nextConfig;
