import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate for pages that only make sense signed in: no session marker, no page. It is a
 * convenience (no flash of an empty account page), not security: the API enforces every call.
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
  matcher: ["/account/:path*", "/checkout/:path*"],
};
