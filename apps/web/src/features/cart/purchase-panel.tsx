"use client";

import { Loader2, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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

  const addToCart = () => {
    if (sizes && !size) {
      setMissingSize(true);
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
      <div className="flex gap-2">
        <Button
          type="button"
          size="lg"
          className="h-11 flex-1 rounded-xl text-sm"
          disabled={!product.in_stock || add.isPending}
          onClick={addToCart}
        >
          {add.isPending ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
          {product.in_stock ? "Add to cart" : "Sold out"}
        </Button>
        <WishlistButton product={product} variant="button" />
      </div>
    </div>
  );
}
