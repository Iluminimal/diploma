"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthActions } from "./use-auth-actions";

/** Үйлчлүүлэгчийг гаргаж, мэдэгдэж, нүүр хуудас руу аваачна: аль дэлгэцээс ч адилхан. */
export function useSignOut() {
  const t = useTranslations("auth.signOut");
  const router = useRouter();
  const { signOut } = useAuthActions();
  return async () => {
    try {
      await signOut();
      toast(t("done"));
    } catch {
      toast.error(t("offline"));
    }
    router.push("/");
    router.refresh();
  };
}
