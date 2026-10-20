"use client";

import { ArrowRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { AnimatedPrice } from "@/components/product/animated-price";
import { Button } from "@/components/ui/button";
import { userMessage } from "@/lib/api/errors";
import { CartLines, UndoBar } from "./cart-lines";
import { FreeShippingProgress } from "./free-shipping-progress";
import { useCart } from "./use-cart";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function CartView() {
  const { data: cart, isPending, error, refetch } = useCart();

  if (isPending) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]" aria-busy aria-label="Loading your Bag">
        <div className="space-y-4">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-32 rounded-[var(--radius-tile)]" />
          ))}
        </div>
        <Skeleton className="hidden h-56 rounded-[var(--radius-tile)] lg:block" />
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
      // Ачаалах skeleton-той ижил өндөр (8rem-ийн 3 мөр ба зайнууд), ингэснээр доорх хуудас
      // үсрэхгүй.
      <div>
        <EmptyState
          icon={ShoppingBag}
          as="p"
          title="Your Bag is empty"
          description="Browse the collection or search with a photo."
          className="min-h-[26rem] py-16"
        >
          <Button asChild size="lg">
            <Link href="/products">Shop all</Link>
          </Button>
          <Button asChild variant="bordered" size="lg">
            <Link href="/search">Search by photo</Link>
          </Button>
        </EmptyState>
        <div className="mx-auto max-w-sm empty:hidden">
          <UndoBar />
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
      <CartLines cart={cart} />
      <aside
        aria-label="Order summary"
        className="tile space-y-4 p-6 lg:sticky lg:top-20"
      >
        <h2 className="type-heading">Summary</h2>
        <FreeShippingProgress subtotalCents={cart.subtotal_cents} />
        <dl className="type-body space-y-2">
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
          <span className="type-heading">Estimated total</span>
          <AnimatedPrice cents={cart.subtotal_cents} currency={cart.currency} className="type-heading" />
        </div>
        {cart.has_issues && (
          <p role="status" className="text-destructive text-sm">
            Some items need your attention before you can check out.
          </p>
        )}
        <Button asChild size="xl" className="w-full" aria-disabled={cart.has_issues}>
          <Link href="/checkout">
            Checkout <ArrowRight />
          </Link>
        </Button>
      </aside>
    </div>
  );
}
