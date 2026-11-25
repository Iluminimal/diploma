import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { buildCsp, cspHeaderName, newNonce, resolveCspMode } from "@/lib/security-headers";

/** Нэвтэрсэн байхыг шаарддаг хуудсууд. */
const PROTECTED = /^\/(account|checkout|admin)(\/|$)/;

/**
 * Хоёр ажил:
 *
 * 1. Нэвтэрсэн байхыг шаарддаг хуудсуудад найдвартай бус хаалт: session marker байхгүй бол хуудас
 *    байхгүй. Энэ нь тав тухын зүйл (хоосон account хуудас анивчихгүй), аюулгүй байдал биш: API
 *    дуудлага бүрийг өөрөө шалгадаг.
 * 2. Хуудас бүрт nonce-той Content-Security-Policy. Nonce-ийг request header-ээр (`x-nonce`, мөн
 *    CSP header өөрөө) дамжуулж, Next өөрийн script-үүдэд, layout өөрийн inline script-үүдэд
 *    хэрэглэнэ.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PROTECTED.test(pathname) && !request.cookies.has("lk_session")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  const production = process.env.NODE_ENV === "production";
  const nonce = newNonce();
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = buildCsp({ nonce, development: !production, https, apiOrigin: new URL(env.NEXT_PUBLIC_API_URL).origin });
  const header = cspHeaderName(resolveCspMode(process.env.CSP_MODE, production));

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set(header, csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(header, csp);
  return response;
}

export const config = {
  // API (`/api`), барааны зураг (`/media`), Next-ийн статик файл болон prefetch-ийг хасна.
  matcher: [
    {
      source: "/((?!api/|media/|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|robots.txt|sitemap).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
