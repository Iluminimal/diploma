"use client";

import { Loader2, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Price } from "@/components/product/price";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SizeSelector } from "@/features/catalog/size-selector";
import type { Product } from "@/features/catalog/product";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import { useCartDrawer } from "./cart-ui-store";
import { useAddToCart } from "./use-cart";

type Props = {
  product: Product;
  /** From `sizesFor`: null for products without sizes (watches, bags, ...). */
  sizes: { label: string; sizes: string[] } | null;
};

/** Size choice, "Add to cart" and the wishlist heart: the interactive part of the product page. */
export function PurchasePanel({ product, sizes }: Props) {
  const [size, setSize] = useState<string | null>(null);
  const [missingSize, setMissingSize] = useState(false);
  const add = useAddToCart();
  const openDrawer = useCartDrawer((state) => state.setOpen);
  const buttonRow = useRef<HTMLDivElement>(null);
  // On phones the page is long: once the main button has scrolled out of sight, a bar keeps it in reach.
  const [barVisible, setBarVisible] = useState(false);

  useEffect(() => {
    const row = buttonRow.current;
    if (!row || !product.in_stock) return;
    const observer = new IntersectionObserver(([entry]) => setBarVisible(entry ? !entry.isIntersecting : false));
    observer.observe(row);
    return () => observer.disconnect();
  }, [product.in_stock]);

  const addToCart = () => {
    if (sizes && !size) {
      setMissingSize(true);
      // From the bar the size picker is off-screen: bring it back.
      buttonRow.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    add.mutate(
      { product_id: product.id, size: size ?? "", quantity: 1 },
      { onSuccess: () => openDrawer(true) },
    );
  };

  return (
    <div className="space-y-6">
      {sizes && (
        <div>
          <SizeSelector
            label={sizes.label}
            sizes={sizes.sizes}
            disabled={!product.in_stock}
            value={size}
            onChange={(next) => {
              setSize(next);
              setMissingSize(false);
            }}
          />
          {missingSize && (
            <p role="alert" className="text-destructive mt-2 text-sm">
              Please select a size.
            </p>
          )}
        </div>
      )}
      <div ref={buttonRow} className="flex gap-2">
        <Button
          type="button"
          size="lg"
          className="h-11 flex-1 rounded-full text-sm"
          disabled={!product.in_stock || add.isPending}
          onClick={addToCart}
        >
          {add.isPending ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
          {product.in_stock ? "Add to cart" : "Sold out"}
        </Button>
        <WishlistButton product={product} variant="button" />
      </div>
      <div
        // Slides up when the main button leaves the screen; hidden (and out of the tab order) otherwise.
        aria-hidden={!barVisible}
        inert={!barVisible}
        className={cn(
          "bg-background/90 border-border fixed inset-x-0 bottom-0 z-30 flex items-center gap-4 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-lg transition-[translate,visibility] duration-500 ease-[var(--ease-out-expo)] md:hidden",
          barVisible ? "visible translate-y-0" : "invisible translate-y-full",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{product.name}</p>
          <Price cents={product.price_cents} currency={product.currency} className="text-muted-foreground text-sm" />
        </div>
        <Button
          type="button"
          size="lg"
          className="h-11 rounded-full px-6 text-sm"
          disabled={add.isPending}
          // Not the same name as the main button: a screen reader meets both on this page.
          aria-label={`Add ${product.name} to cart`}
          onClick={addToCart}
        >
          {add.isPending ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
          Add to cart
        </Button>
      </div>
    </div>
  );
}
