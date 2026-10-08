"use client";

import { ShoppingBag } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MiniCartSkeleton } from "./mini-cart";
import { useCartDrawer } from "./cart-ui-store";
import { useCart } from "./use-cart";

// The drawer's list, steppers and mutations are only fetched when someone opens it.
const MiniCart = dynamic(() => import("./mini-cart").then((m) => m.MiniCart), {
  ssr: false,
  loading: () => <MiniCartSkeleton />,
});

export function CartButton() {
  const { open, setOpen } = useCartDrawer();
  const { data } = useCart();
  const count = data?.item_count ?? 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={count ? `Cart, ${count} items` : "Cart"}>
          <ShoppingBag />
          {count > 0 && (
            <span
              aria-hidden
              className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full px-1 text-[0.65rem] leading-4.5 font-semibold tabular-nums"
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-border border-b p-4 pr-12">
          <SheetTitle>Your cart{count > 0 && ` (${count})`}</SheetTitle>
          <SheetDescription className="sr-only">Items you have added, with quantities and subtotal.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col pt-4">
          <MiniCart onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
