"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-store";

/**
 * /account/* : `proxy.ts` зөвхөн session cookie байгаа эсэхийг шалгадаг. Cookie хуучирсан (refresh
 * татгалзсан) бол хуудас API-ийн алдааны текст харуулахын оронд нэвтрэх хуудас руу явуулж, нэвтэрсний
 * дараа энд буцаана.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const status = useAuth((state) => state.status);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);
  return status === "signedOut" ? null : children;
}
