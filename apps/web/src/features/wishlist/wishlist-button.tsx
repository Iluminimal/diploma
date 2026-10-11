"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-store";
import type { Product } from "@/features/catalog/product";
import { cn } from "@/lib/utils";
import { useToggleWishlist, useWishlist } from "./use-wishlist";

type Props = {
  product: Product;
  /** `card`: a round overlay for product cards. `button`: a labelled button for the product page. */
  variant?: "card" | "button";
  className?: string;
};

export function WishlistButton({ product, variant = "card", className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuth((state) => state.status);
  const { data } = useWishlist();
  const toggle = useToggleWishlist();
  const saved = data?.items.some((item) => item.id === product.id) ?? false;

  const onClick = () => {
    if (status === "signedOut") {
      toast("Sign in to save items to your wishlist.");
      router.push(`/login?next=${encodeURIComponent(pathname || "/")}`);
      return;
    }
    toggle.mutate({ product, saved: !saved });
  };

  const label = saved ? `Remove ${product.name} from your wishlist` : `Save ${product.name} to your wishlist`;
  // `key` restarts the pop each time the heart fills.
  const icon = <Heart key={String(saved)} className={cn("size-[1.15rem]", saved && "animate-pop fill-current")} />;

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        disabled={status === "unknown"}
        className={cn(
          "border-input hover:bg-muted focus-visible:ring-ring/60 inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 disabled:opacity-50",
          saved && "border-foreground",
          className,
        )}
      >
        {icon} {saved ? "Saved" : "Save"}
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
        "bg-background/85 hover:bg-background focus-visible:ring-ring/60 grid size-9 place-items-center rounded-full shadow-sm backdrop-blur transition-colors outline-none focus-visible:ring-3 disabled:opacity-50",
        className,
      )}
    >
      {icon}
    </button>
  );
}
