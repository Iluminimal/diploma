"use client";

import { Check, Loader2, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Price } from "@/components/product/price";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SizeSelector } from "@/features/catalog/size-selector";
import type { Product } from "@/features/catalog/product";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import { useCartDrawer } from "./cart-ui-store";
import { flyToCart } from "./fly-to-cart";
import { useAddToCart } from "./use-cart";

type Props = {
  product: Product;
  /** From `sizesFor`: null for products without sizes (watches, bags, ...). */
  sizes: { label: string; sizes: string[] } | null;
};

/** Size choice, "Add to Bag" and the wishlist heart: the interactive part of the product page. */
export function PurchasePanel({ product, sizes }: Props) {
  const [size, setSize] = useState<string | null>(null);
  const [missingSize, setMissingSize] = useState(false);
  // Bumped each time a size is missing, so the shake restarts even when it is already showing.
  const [shake, setShake] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const add = useAddToCart();
  const openDrawer = useCartDrawer((state) => state.setOpen);
  const setAdded = useCartDrawer((state) => state.setAdded);
  const buttonRow = useRef<HTMLDivElement>(null);
  const sizeBox = useRef<HTMLDivElement>(null);
  // On phones the page is long: once the main button has scrolled out of sight, a bar keeps it in reach.
  const [barVisible, setBarVisible] = useState(false);

  useEffect(() => {
    const row = buttonRow.current;
    if (!row || !product.in_stock) return;
    const observer = new IntersectionObserver(([entry]) => setBarVisible(entry ? !entry.isIntersecting : false));
    observer.observe(row);
    return () => observer.disconnect();
  }, [product.in_stock]);

  // The shake restarts by remounting the sizes, so the cursor goes in once they are back.
  useEffect(() => {
    if (shake > 0) sizeBox.current?.querySelector("input")?.focus({ preventScroll: true });
  }, [shake]);

  // The check mark on the button lasts a moment, then it is "Add to Bag" again.
  useEffect(() => {
    if (!justAdded) return;
    const timer = window.setTimeout(() => setJustAdded(false), 1600);
    return () => window.clearTimeout(timer);
  }, [justAdded]);

  const addToCart = (pressed: HTMLElement | null) => {
    if (sizes && !size) {
      setMissingSize(true);
      setShake((count) => count + 1);
      // From the bar the size picker is off-screen: bring it back, and put the cursor in it.
      sizeBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    add.mutate(
      { product_id: product.id, size: size ?? "", quantity: 1 },
      {
        onSuccess: async () => {
          setJustAdded(true);
          setAdded({ productId: product.id, size: size ?? "" });
          await flyToCart(document.querySelector("[data-fly-source]"), pressed, product.image.thumb_400);
          openDrawer(true);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <p role="status" className="sr-only">
        {justAdded ? `${product.name} was added to your cart.` : ""}
      </p>
      {sizes && (
        <div ref={sizeBox}>
          <div key={shake} className={cn(shake > 0 && "animate-shake")}>
            <SizeSelector
              label={sizes.label}
              sizes={sizes.sizes}
              disabled={!product.in_stock}
              value={size}
              invalid={missingSize}
              describedBy="size-error"
              onChange={(next) => {
                setSize(next);
                setMissingSize(false);
              }}
            />
          </div>
          {missingSize && (
            <p
              id="size-error"
              role="alert"
              className="text-destructive animate-in fade-in slide-in-from-top-1 mt-2 text-sm duration-300"
            >
              Please select a size.
            </p>
          )}
        </div>
      )}
      <div ref={buttonRow} className="flex flex-col gap-3">
        <Button
          type="button"
          size="xl"
          className="w-full"
          disabled={!product.in_stock || add.isPending}
          onClick={(event) => addToCart(event.currentTarget)}
        >
          <AddIcon pending={add.isPending} added={justAdded} />
          {justAdded ? "Added" : product.in_stock ? "Add to Bag" : "Sold out"}
        </Button>
        <WishlistButton product={product} variant="button" className="h-12 w-full text-[1.0625rem] font-normal" />
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
          <p className="type-caption truncate font-semibold">{product.name}</p>
          <Price cents={product.price_cents} currency={product.currency} className="text-muted-foreground type-caption" />
        </div>
        <Button
          type="button"
          disabled={add.isPending}
          // Not the same name as the main button: a screen reader meets both on this page.
          aria-label={`Add ${product.name} to Bag`}
          onClick={(event) => addToCart(event.currentTarget)}
        >
          <AddIcon pending={add.isPending} added={justAdded} />
          {justAdded ? "Added" : "Add to Bag"}
        </Button>
      </div>
    </div>
  );
}

/** Bag, then a spinner while the request runs, then a check mark that pops in. */
function AddIcon({ pending, added }: { pending: boolean; added: boolean }) {
  if (pending) return <Loader2 className="animate-spin" />;
  if (added) return <Check key="added" className="animate-pop" />;
  return <ShoppingBag />;
}
