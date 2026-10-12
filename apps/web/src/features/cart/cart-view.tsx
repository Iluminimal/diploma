"use client";

import { ArrowRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { AnimatedPrice } from "@/components/product/animated-price";
import { Button } from "@/components/ui/button";
import { userMessage } from "@/lib/api/errors";
import { CartLines } from "./cart-lines";
import { FreeShippingProgress } from "./free-shipping-progress";
import { useCart } from "./use-cart";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function CartView() {
  const { data: cart, isPending, error, refetch } = useCart();

  if (isPending) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]" aria-busy aria-label="Loading your cart">
        <div className="space-y-4">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="hidden h-56 rounded-2xl lg:block" />
      </div>
    );
  }
  if (error || !cart) {
    return (
      <div className="space-y-3">
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
      // As tall as the loading skeleton (3 rows of 8rem and their gaps), so the page below does not jump.
      <EmptyState
        icon={ShoppingBag}
        as="p"
        title="Your cart is empty"
        description="Browse the collection or search with a photo."
        className="min-h-[26rem] py-16"
      >
        <Button asChild size="lg" className="h-11 rounded-full px-5">
          <Link href="/products">Shop all</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-11 rounded-full px-5">
          <Link href="/search">Search by photo</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
      <CartLines cart={cart} />
      <aside
        aria-label="Order summary"
        className="border-border bg-card space-y-4 rounded-2xl border p-5 lg:sticky lg:top-24"
      >
        <h2 className="text-base font-semibold">Summary</h2>
        <FreeShippingProgress subtotalCents={cart.subtotal_cents} />
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal ({cart.item_count} items)</dt>
            <dd>
              <AnimatedPrice cents={cart.subtotal_cents} currency={cart.currency} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd className="text-muted-foreground">Calculated at checkout</dd>
          </div>
        </dl>
        <div className="border-border flex items-baseline justify-between border-t pt-4">
          <span className="font-medium">Estimated total</span>
          <AnimatedPrice cents={cart.subtotal_cents} currency={cart.currency} className="text-lg font-semibold" />
        </div>
        {cart.has_issues && (
          <p role="status" className="text-destructive text-sm">
            Some items need your attention before you can check out.
          </p>
        )}
        <Button asChild size="lg" className="h-11 w-full rounded-full text-sm" aria-disabled={cart.has_issues}>
          <Link href="/checkout">
            Checkout <ArrowRight />
          </Link>
        </Button>
      </aside>
    </div>
  );
}
