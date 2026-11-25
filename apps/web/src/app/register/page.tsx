import { permanentRedirect } from "next/navigation";
import { safeNext } from "@/features/auth/safe-next";

/** Нэвтрэх ба бүртгүүлэх нэг хуудас: `/register` нь "Бүртгүүлэх" горимтой нээгдэнэ. */
export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const next = safeNext((await searchParams).next);
  permanentRedirect(
    next === "/" ? "/login?mode=register" : `/login?mode=register&next=${encodeURIComponent(next)}`,
  );
}
