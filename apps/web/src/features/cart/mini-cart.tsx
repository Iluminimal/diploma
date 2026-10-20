"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { AnimatedPrice } from "@/components/product/animated-price";
import { Button } from "@/components/ui/button";
import { userMessage } from "@/lib/api/errors";
import { CartLines, UndoBar } from "./cart-lines";
import { FreeShippingProgress } from "./free-shipping-progress";
import { useCart } from "./use-cart";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function MiniCartSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
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

/** Bag-ийн агуулга. Хуудас бүрийн JS-д орохгүйн тулд lazy ачаална (cart-button.tsx-г хар). */
export function MiniCart({ onNavigate }: { onNavigate: () => void }) {
  const { data: cart, isPending, error, refetch } = useCart();

  if (isPending) return <MiniCartSkeleton />;
  if (error || !cart) {
    return (
      <div className="space-y-3 text-sm">
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
      <>
        <EmptyState
          icon={ShoppingBag}
          as="p"
          title="Your Bag is empty"
          description="Find something you love and it will wait for you here."
          // apple.com-ын flyout-ын доорх хоосон Bag нь төвлөрсөн зураг биш, зүүн тийш эгнээтэй
          // гарчиг ба нэг мөр.
          className="flex-1 pb-16 md:flex-none md:items-start md:px-0 md:py-0 md:pb-0 md:text-left md:[&>div:last-child]:justify-start md:[&>span]:hidden md:[&_.type-body]:text-xs"
        >
          <Button asChild variant="bordered" onClick={onNavigate}>
            <Link href="/products">Continue shopping</Link>
          </Button>
        </EmptyState>
        {/* Сүүлийн мөрийг хасахад cart хоосон болно: буцах зам энд байна. */}
        <div className="pb-4 empty:hidden">
          <UndoBar />
        </div>
      </>
    );
  }

  return (
    <>
      <CartLines cart={cart} onNavigate={onNavigate} />
      <div className="border-border mt-8 space-y-3 border-t pt-6">
        <FreeShippingProgress subtotalCents={cart.subtotal_cents} />
        <div className="flex items-baseline justify-between">
          <span className="type-body font-semibold">Subtotal</span>
          <AnimatedPrice cents={cart.subtotal_cents} currency={cart.currency} className="type-body font-semibold" />
        </div>
        <p className="text-muted-foreground text-xs">Shipping is calculated at checkout.</p>
        <Button asChild size="xl" className="w-full" onClick={onNavigate}>
          <Link href="/checkout">Check Out</Link>
        </Button>
        <Button asChild variant="link" className="w-full" onClick={onNavigate}>
          <Link href="/cart">View Bag</Link>
        </Button>
      </div>
    </>
  );
}
