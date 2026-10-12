"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MobileTabBar, showsTabBar } from "./mobile-tab-bar";

/**
 * The storefront's header, main area and footer around every page except the admin area, which
 * brings its own shell (sidebar, no shop navigation, no footer). The header and footer arrive as
 * props, already rendered on the server, so this only decides whether to show them.
 */
export function ShopChrome({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/"))
    return <>{children}</>;
  return (
    <>
      {header}
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      {footer}
      <MobileTabBar />
      {/* Room under the footer so the bar never covers its last line. */}
      {showsTabBar(pathname) && <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden" />}
    </>
  );
}
