import { NextResponse, type NextRequest } from "next/server";

/**
 * Нэвтэрсэн байхыг шаарддаг хуудсуудад зориулсан найдвартай бус хаалт: session marker байхгүй бол
 * хуудас байхгүй. Энэ нь тав тухын зүйл (хоосон account хуудас анивчихгүй), аюулгүй байдал биш: API
 * дуудлага бүрийг өөрөө шалгадаг.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("lk_session")) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set(
    "next",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/account/:path*", "/checkout/:path*", "/admin/:path*"],
};
