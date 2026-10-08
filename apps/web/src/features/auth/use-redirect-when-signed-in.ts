"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-store";

/** Someone who is already signed in has no business on the login or register page. */
export function useRedirectWhenSignedIn(destination: string) {
  const router = useRouter();
  const status = useAuth((state) => state.status);
  useEffect(() => {
    if (status === "signedIn") router.replace(destination);
  }, [status, destination, router]);
}
