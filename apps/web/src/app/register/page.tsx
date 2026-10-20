import { permanentRedirect } from "next/navigation";
import { safeNext } from "@/features/auth/safe-next";

/** Нэвтрэх ба бүртгүүлэх одоо нэг урсгал: хуучин хаяг ажиллаж байна. */
export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const next = safeNext((await searchParams).next);
  permanentRedirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
}
