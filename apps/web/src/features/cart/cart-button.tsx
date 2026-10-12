"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { BagGlyph, HEADER_CELL } from "@/components/layout/header-cell";
import { cn } from "@/lib/utils";
import { useCartDrawer } from "./cart-ui-store";
import { useCart } from "./use-cart";

// Not in the first load: most visits never open the cart, and the drawer drags a dialog library
// with it. It is fetched the first time something opens it (this button, or "Add to cart").
const CartDrawer = dynamic(
  () => import("./cart-drawer").then((m) => m.CartDrawer),
  { ssr: false },
);

export function CartButton() {
  const { open, setOpen } = useCartDrawer();
  const { data } = useCart();
  const trigger = useRef<HTMLButtonElement>(null);
  const [wanted, setWanted] = useState(false);
  if (open && !wanted) setWanted(true);
  const count = data?.item_count ?? 0;
  const label = count > 99 ? "99+" : String(count);
  const width = count > 0 ? Math.min(label.length, 3) : 0;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={HEADER_CELL}
        data-cart-button
        aria-label={count ? `Cart, ${count} items` : "Cart"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {/* The icon box is the one the badge is placed against, as on apple.com: with items in it the
            bag steps left to make room, further for two and three characters. */}
        <span
          aria-hidden
          className={cn(
            "relative block h-12 w-[17px] transition-transform duration-300 ease-[cubic-bezier(.25,.1,.3,1)] md:h-11 md:w-3.5",
            width === 1 && "-translate-x-1 md:-translate-x-1.5",
            width === 2 && "-translate-x-2.5 md:-translate-x-[11px]",
            width === 3 && "-translate-x-[17px]",
          )}
        >
          <BagGlyph />
          {count > 0 && (
            <span
              // Remounts when the count changes, which replays the pop.
              key={count}
              className="animate-pop bg-foreground text-background absolute bottom-[13px] left-[22px] block h-[1.3em] min-w-[1.3em] rounded-full text-center text-[10px] leading-[1.3] tracking-[-0.008em] tabular-nums md:bottom-[11px] md:left-[15px]"
              style={width > 1 ? { paddingInline: "0.325em" } : undefined}
            >
              {label}
            </span>
          )}
        </span>
      </button>
      {wanted && (
        <CartDrawer
          open={open}
          onOpenChange={setOpen}
          count={count}
          trigger={trigger}
        />
      )}
    </>
  );
}
