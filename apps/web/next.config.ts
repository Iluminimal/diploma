import type { NextConfig } from "next";

// Browser API-г энэ сайтаар (нэг origin) дамжуулан дууддаг тул httpOnly refresh cookie нь сайтынх нь өөрийнх болно.
// Server талын код API-д API_INTERNAL_URL-ээр шууд хүрнэ.
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
      // Барааны зургийг мөн энэ origin-оос үйлчилнэ: browser API руу хоёр дахь холболт нээхгүй, хуудас ирсэн холболтоо ашиглана.
      { source: "/media/:path*", destination: `${apiOrigin}/media/:path*` },
    ];
  },
};

export default nextConfig;
