"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-store";
import type { Product } from "@/features/catalog/product";
import { cn } from "@/lib/utils";
import { rememberPendingWishlist } from "./pending-wishlist";
import { useToggleWishlist, useWishlist } from "./use-wishlist";

type Props = {
  product: Product;
  /**
   * `card`: бүтээгдэхүүний картын дээрх дугуй overlay. `button`: бүтээгдэхүүний хуудасны label-тэй
   * товч.
   */
  variant?: "card" | "button";
  className?: string;
};

export function WishlistButton({ product, variant = "card", className }: Props) {
  const t = useTranslations("account.wishlist");
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuth((state) => state.status);
  const { data } = useWishlist();
  const toggle = useToggleWishlist();
  const saved = data?.items.some((item) => item.id === product.id) ?? false;
  // Хадгалах бүрд (хасахад биш) нэг удаа "цэгүүд тархах" animation-ыг дахин эхлүүлнэ.
  const [burst, setBurst] = useState(0);

  const onClick = () => {
    if (status === "signedOut") {
      toast(t("signIn"));
      rememberPendingWishlist(product);
      // Query-тэй хамт (шүүлтүүр, хуудас) буцаж ирнэ.
      router.push(`/login?next=${encodeURIComponent(`${pathname || "/"}${window.location.search}`)}`);
      return;
    }
    if (!saved) setBurst((count) => count + 1);
    toggle.mutate({ product, saved: !saved });
  };

  const label = saved ? t("remove", { name: product.name }) : t("save", { name: product.name });
  // `key` зүрх дүүрэх бүрд pop animation-ыг дахин эхлүүлнэ.
  const icon = (
    <span className="relative grid place-items-center">
      <Heart key={String(saved)} className={cn("size-[1.15rem]", saved && "animate-pop fill-current")} />
      {burst > 0 && saved && (
        <span key={burst} aria-hidden className="heart-burst">
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <i key={angle} style={{ "--a": angle } as CSSProperties} />
          ))}
        </span>
      )}
    </span>
  );

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        disabled={status === "unknown"}
        className={cn(
          "border-input hover:bg-muted focus-visible:ring-ring/50 inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 type-caption font-medium transition-colors outline-none focus-visible:ring-3 disabled:opacity-50",
          saved && "border-foreground",
          className,
        )}
      >
        {icon} {saved ? t("saved") : t("saveShort")}
        <span className="sr-only">{label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      disabled={status === "unknown"}
      className={cn(
        "bg-background/85 hover:bg-background focus-visible:ring-ring/50 grid size-9 place-items-center rounded-full shadow-sm backdrop-blur transition-[background-color,scale] outline-none focus-visible:ring-3 active:scale-90 disabled:opacity-50",
        className,
      )}
    >
      {icon}
    </button>
  );
}
