"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-store";
import { landingPath } from "./landing";

/** Someone who is already signed in has no business on the login or register page. */
export function useRedirectWhenSignedIn(destination: string, enabled = true) {
  const router = useRouter();
  const status = useAuth((state) => state.status);
  const role = useAuth((state) => state.user?.role);
  useEffect(() => {
    if (enabled && status === "signedIn") router.replace(landingPath(destination, role));
  }, [enabled, status, role, destination, router]);
}
