"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { AnimatedPrice } from "@/components/product/animated-price";
import { Button } from "@/components/ui/button";
import { userMessage } from "@/lib/api/errors";
import { CartLines } from "./cart-lines";
import { FreeShippingProgress } from "./free-shipping-progress";
import { useCart } from "./use-cart";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function MiniCartSkeleton() {
  return (
    <div className="space-y-4 px-4" aria-hidden>
      {[0, 1].map((n) => (
        <div key={n} className="flex gap-3">
          <Skeleton className="aspect-[3/4] w-20 rounded-xl" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3.5 w-4/5 rounded" />
            <Skeleton className="h-3 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The drawer's content. Loaded lazily (see cart-button.tsx) to keep it out of every page's JS. */
export function MiniCart({ onNavigate }: { onNavigate: () => void }) {
  const { data: cart, isPending, error, refetch } = useCart();

  if (isPending) return <MiniCartSkeleton />;
  if (error || !cart) {
    return (
      <div className="space-y-3 px-4 text-sm">
        <p role="alert" className="text-destructive">
          {userMessage(error)}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        as="p"
        title="Your cart is empty"
        description="Find something you love and it will wait for you here."
        className="flex-1 pb-16"
      >
        <Button asChild variant="outline" size="lg" className="h-10 rounded-full px-5" onClick={onNavigate}>
          <Link href="/products">Continue shopping</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <CartLines cart={cart} onNavigate={onNavigate} />
      </div>
      <div className="border-border space-y-3 border-t p-4">
        <FreeShippingProgress subtotalCents={cart.subtotal_cents} />
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Subtotal</span>
          <AnimatedPrice cents={cart.subtotal_cents} currency={cart.currency} className="text-base font-semibold" />
        </div>
        <p className="text-muted-foreground text-xs">Shipping is calculated at checkout.</p>
        <Button asChild size="lg" className="h-11 w-full rounded-full text-sm" onClick={onNavigate}>
          <Link href="/checkout">Checkout</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-11 w-full rounded-full text-sm" onClick={onNavigate}>
          <Link href="/cart">View cart</Link>
        </Button>
      </div>
    </>
  );
}
