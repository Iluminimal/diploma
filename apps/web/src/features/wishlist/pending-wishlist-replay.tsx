"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-store";
import { takePendingWishlist } from "./pending-wishlist";
import { useToggleWishlist } from "./use-wishlist";

/**
 * Зочин зүрх дарж нэвтэрсэн бол тэр барааг одоо хадгална: нэвтрэх шалтгаан нь энэ байсан тул
 * хэрэглэгч дахин зүрх дарах шаардлагагүй. Нэвтэрсэн төлөвт шилжих бүрт нэг удаа шалгана.
 */
export function PendingWishlistReplay() {
  const t = useTranslations("account.wishlist");
  const status = useAuth((state) => state.status);
  const { mutate } = useToggleWishlist();
  useEffect(() => {
    if (status !== "signedIn") return;
    const product = takePendingWishlist();
    if (!product) return;
    mutate({ product, saved: true }, { onSuccess: () => toast.success(t("savedAfterSignIn", { name: product.name })) });
  }, [status, mutate, t]);
  return null;
}
