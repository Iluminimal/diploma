"use client";

import { AnimatePresence, m } from "motion/react";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { EASE_OUT_EXPO } from "@/components/motion/easing";
import { MotionProvider } from "@/components/motion/motion-provider";
import { AnimatedPrice } from "@/components/product/animated-price";
import { ProductImage } from "@/components/product/product-image";
import { productPath, productSubtitle } from "@/features/catalog/product";
import { cn } from "@/lib/utils";
import type { Cart, CartLine } from "./cart-api";
import { QuantityStepper } from "./quantity-stepper";
import { useRemoveItem, useSetQuantity } from "./use-cart";

type Props = {
  cart: Cart;
  /** Called when a product link is followed (the drawer closes itself). */
  onNavigate?: () => void;
  className?: string;
};

export function CartLines({ cart, onNavigate, className }: Props) {
  return (
    <ul className={cn("divide-border divide-y", className)} aria-label="Items in your cart">
      <MotionProvider>
        <AnimatePresence initial={false}>
          {cart.lines.map((line) => (
            <CartLineItem key={line.id} line={line} onNavigate={onNavigate} />
          ))}
        </AnimatePresence>
      </MotionProvider>
    </ul>
  );
}

function CartLineItem({ line, onNavigate }: { line: CartLine; onNavigate?: () => void }) {
  const setQuantity = useSetQuantity();
  const remove = useRemoveItem();
  const { product } = line;
  const soldOut = line.issue === "out_of_stock";

  return (
    <m.li
      // Lines slide closed when removed instead of snapping away.
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      className="flex gap-3 overflow-hidden py-4 first:pt-0"
    >
      <Link href={productPath(product)} onClick={onNavigate} className="w-20 shrink-0 sm:w-24">
        <div className="bg-muted aspect-[3/4] overflow-hidden rounded-xl">
          <ProductImage product={product} sizes="96px" />
        </div>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={productPath(product)}
            onClick={onNavigate}
            className="line-clamp-2 text-sm leading-snug font-medium hover:underline"
          >
            {product.name}
          </Link>
          <button
            type="button"
            aria-label={`Remove ${product.name} from your cart`}
            onClick={() => remove.mutate(line.id)}
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          {line.size ? `Size ${line.size} · ` : ""}
          {productSubtitle(product)}
        </p>
        {line.issue === "out_of_stock" && (
          <p role="status" className="text-destructive mt-1 text-xs font-medium">
            Sold out. Remove it to check out.
          </p>
        )}
        {line.issue === "low_stock" && (
          <p role="status" className="text-destructive mt-1 text-xs font-medium">
            Only {line.max_quantity} left.{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => setQuantity.mutate({ itemId: line.id, quantity: line.max_quantity })}
            >
              Update to {line.max_quantity}
            </button>
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          {soldOut ? (
            <span className="text-muted-foreground text-sm">Qty {line.quantity}</span>
          ) : (
            <QuantityStepper
              value={line.quantity}
              max={line.max_quantity}
              name={product.name}
              onChange={(quantity) => setQuantity.mutate({ itemId: line.id, quantity })}
            />
          )}
          <AnimatedPrice
            cents={line.line_total_cents}
            currency={product.currency}
            className={cn("text-sm font-medium", soldOut && "text-muted-foreground line-through")}
          />
        </div>
      </div>
    </m.li>
  );
}
