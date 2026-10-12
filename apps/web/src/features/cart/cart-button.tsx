"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCartDrawer } from "./cart-ui-store";
import { useCart } from "./use-cart";

// Not in the first load: most visits never open the cart, and the drawer drags a dialog library
// with it. It is fetched the first time something opens it (this button, or "Add to cart").
const CartDrawer = dynamic(
  () => import("./cart-drawer").then((m) => m.CartDrawer),
  { ssr: false },
);

/** Apple's own bag outline: the 17px one on a phone, the 14px one from md up. */
function BagIcon() {
  return (
    <>
      <svg
        className="md:hidden"
        width="17"
        height="48"
        viewBox="0 0 17 48"
        fill="currentColor"
      >
        <path d="m13.4575 16.9268h-1.1353a3.8394 3.8394 0 0 0 -7.6444 0h-1.1353a2.6032 2.6032 0 0 0 -2.6 2.6v8.9232a2.6032 2.6032 0 0 0 2.6 2.6h9.915a2.6032 2.6032 0 0 0 2.6-2.6v-8.9231a2.6032 2.6032 0 0 0 -2.6-2.6001zm-4.9575-2.2768a2.658 2.658 0 0 1 2.6221 2.2764h-5.2442a2.658 2.658 0 0 1 2.6221-2.2764zm6.3574 13.8a1.4014 1.4014 0 0 1 -1.4 1.4h-9.9149a1.4014 1.4014 0 0 1 -1.4-1.4v-8.9231a1.4014 1.4014 0 0 1 1.4-1.4h9.915a1.4014 1.4014 0 0 1 1.4 1.4z" />
      </svg>
      <svg
        className="hidden md:block"
        width="14"
        height="44"
        viewBox="0 0 14 44"
        fill="currentColor"
      >
        <path d="m11.3535 16.0283h-1.0205a3.4229 3.4229 0 0 0 -3.333-2.9648 3.4229 3.4229 0 0 0 -3.333 2.9648h-1.02a2.1184 2.1184 0 0 0 -2.117 2.1162v7.7155a2.1186 2.1186 0 0 0 2.1162 2.1167h8.707a2.1186 2.1186 0 0 0 2.1168-2.1167v-7.7155a2.1184 2.1184 0 0 0 -2.1165-2.1162zm-4.3535-1.8652a2.3169 2.3169 0 0 1 2.2222 1.8652h-4.4444a2.3169 2.3169 0 0 1 2.2222-1.8652zm5.37 11.6969a1.0182 1.0182 0 0 1 -1.0166 1.0171h-8.7069a1.0182 1.0182 0 0 1 -1.0165-1.0171v-7.7155a1.0178 1.0178 0 0 1 1.0166-1.0166h8.707a1.0178 1.0178 0 0 1 1.0164 1.0166z" />
      </svg>
    </>
  );
}

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
        className="focus-visible:ring-ring/60 grid h-12 w-11 place-items-center rounded-full outline-none transition-opacity hover:opacity-70 focus-visible:ring-3 md:h-11"
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
          <BagIcon />
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
