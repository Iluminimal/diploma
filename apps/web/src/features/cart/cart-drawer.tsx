"use client";

import dynamic from "next/dynamic";
import type { RefObject } from "react";
import { useSwipeDismiss } from "@/components/ui/use-swipe-dismiss";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MiniCartSkeleton } from "./mini-cart";

// The drawer's list, steppers and mutations are only fetched when someone opens it.
const MiniCart = dynamic(() => import("./mini-cart").then((m) => m.MiniCart), {
  ssr: false,
  loading: () => <MiniCartSkeleton />,
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  /** The button that opens the drawer: focus goes back to it on close. */
  trigger: RefObject<HTMLButtonElement | null>;
};

/** Loaded on first open (see `CartButton`): the dialog library is not needed to show a cart icon. */
export function CartDrawer({ open, onOpenChange, count, trigger }: Props) {
  // On a phone the drawer can be flicked away to the right.
  const swipe = useSwipeDismiss("x", () => onOpenChange(false));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full touch-pan-y gap-0 sm:max-w-md"
        {...swipe}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <SheetHeader className="border-border border-b p-4 pr-12">
          <SheetTitle>Your cart{count > 0 && ` (${count})`}</SheetTitle>
          <SheetDescription className="sr-only">Items you have added, with quantities and subtotal.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col pt-4">
          <MiniCart onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
