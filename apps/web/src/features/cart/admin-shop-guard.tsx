"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-store";
import { staffHome } from "@/features/auth/roles";

/** /cart, /checkout: ажилтныг (админ, агуулахын ажилтан) back-office руу буцаана, хуудсыг нь харуулахгүй. API мөн 403 өгнө. */
export function AdminShopGuard({ children }: { children: ReactNode }) {
  const home = useAuth((state) => staffHome(state.user?.role));
  const router = useRouter();
  useEffect(() => {
    if (home) router.replace(home);
  }, [home, router]);
  return home ? null : children;
}
