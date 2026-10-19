import { permanentRedirect } from "next/navigation";
import { safeNext } from "@/features/auth/safe-next";

/** Signing in and signing up are one flow now: the old address keeps working. */
export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const next = safeNext((await searchParams).next);
  permanentRedirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
}
