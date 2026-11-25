import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { staticSecurityHeaders } from "./src/lib/security-headers";

// URL-д хэлний угтвар байхгүй: хэлийг cookie (эхний удаа Accept-Language) шийднэ, `src/i18n/request.ts`.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Browser API-г энэ сайтаар (нэг origin) дамжуулан дууддаг тул httpOnly refresh cookie нь сайтынх нь өөрийнх болно.
// Server талын код API-д API_INTERNAL_URL-ээр шууд хүрнэ.
const apiOrigin =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Docker image (apps/web/Dockerfile) нь `NEXT_OUTPUT=standalone`-ээр өөрөө өөрийгөө агуулсан server (`server.js`) үүсгэнэ;
  // `next start` ашигладаг локал build (e2e, Lighthouse) үүнийг хэрэглэхгүй.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // `X-Powered-By: Next.js` нь халдагчид хэрэгтэй зүйлийг ил гаргахаас өөр юм хийдэггүй.
  poweredByHeader: false,
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
  },
  async headers() {
    // CSP-г (хүсэлт бүрт nonce хэрэгтэй) `src/proxy.ts` тавина; үлдсэн нь тогтмол.
    return [{ source: "/:path*", headers: staticSecurityHeaders({ production: process.env.NODE_ENV === "production" }) }];
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
      // Барааны зургийг мөн энэ origin-оос үйлчилнэ: browser API руу хоёр дахь холболт нээхгүй, хуудас ирсэн холболтоо ашиглана.
      { source: "/media/:path*", destination: `${apiOrigin}/media/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
