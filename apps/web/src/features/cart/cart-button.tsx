"use client";

import { ShoppingBag } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCartDrawer } from "./cart-ui-store";
import { useCart } from "./use-cart";

// Not in the first load: most visits never open the cart, and the drawer drags a dialog library
// with it. It is fetched the first time something opens it (this button, or "Add to cart").
const CartDrawer = dynamic(() => import("./cart-drawer").then((m) => m.CartDrawer), { ssr: false });

export function CartButton() {
  const { open, setOpen } = useCartDrawer();
  const { data } = useCart();
  const trigger = useRef<HTMLButtonElement>(null);
  const [wanted, setWanted] = useState(false);
  if (open && !wanted) setWanted(true);
  const count = data?.item_count ?? 0;

  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="relative"
        data-cart-button
        aria-label={count ? `Cart, ${count} items` : "Cart"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ShoppingBag />
        {count > 0 && (
          <span
            // Remounts when the count changes, which replays the pop.
            key={count}
            aria-hidden
            className="animate-pop bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full px-1 text-[0.65rem] leading-4.5 font-semibold tabular-nums"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>
      {wanted && <CartDrawer open={open} onOpenChange={setOpen} count={count} trigger={trigger} />}
    </>
  );
}
