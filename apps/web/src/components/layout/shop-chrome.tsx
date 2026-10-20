"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Admin хэсгээс бусад бүх хуудасны эргэн тойрох дэлгүүрийн header, үндсэн хэсэг, footer. Admin нь
 * өөрийн shell-тэй (sidebar, дэлгүүрийн навигаци ба footer-гүй). Header ба footer нь server дээр
 * render хийгдсэн props-оор ирдэг тул энэ нь зөвхөн харуулах эсэхийг шийднэ.
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
    </>
  );
}
