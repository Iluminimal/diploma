"use client";

import { AnimatePresence, m } from "motion/react";
import { Heart, Trash2 } from "lucide-react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { EASE_OUT_EXPO } from "@/components/motion/easing";
import { MotionProvider } from "@/components/motion/motion-provider";
import { AnimatedPrice } from "@/components/product/animated-price";
import { ProductImage } from "@/components/product/product-image";
import { useAuth } from "@/features/auth/auth-store";
import { productPath, productSubtitle } from "@/features/catalog/product";
import { useToggleWishlist } from "@/features/wishlist/use-wishlist";
import { cn } from "@/lib/utils";
import type { Cart, CartLine } from "./cart-api";
import { useCartDrawer } from "./cart-ui-store";
import { QuantityStepper } from "./quantity-stepper";
import { useAddToCart, useCart, useRemoveItem, useSetQuantity } from "./use-cart";

type Props = {
  cart: Cart;
  /** Called when a product link is followed (the drawer closes itself). */
  onNavigate?: () => void;
  className?: string;
};

export function CartLines({ cart, onNavigate, className }: Props) {
  return (
    <>
      <ul className={cn("divide-border divide-y", className)} aria-label="Items in your Bag">
        <MotionProvider>
          <AnimatePresence initial={false}>
            {cart.lines.map((line) => (
              <CartLineItem key={line.id} line={line} onNavigate={onNavigate} />
            ))}
          </AnimatePresence>
        </MotionProvider>
      </ul>
      <UndoBar />
    </>
  );
}

/** "Removed Blue Kurta. Undo": for a few seconds after a line is taken out, in the cart itself. */
export function UndoBar() {
  const removed = useCartDrawer((state) => state.removed);
  const setRemoved = useCartDrawer((state) => state.setRemoved);
  const add = useAddToCart();
  const { data: cart } = useCart();

  useEffect(() => {
    if (!removed) return;
    const timer = window.setTimeout(() => setRemoved(null), 8000);
    return () => window.clearTimeout(timer);
  }, [removed, setRemoved]);

  if (!removed) return null;
  // If the removal failed the line is back in the cart: there is nothing to undo.
  if (cart?.lines.some((line) => line.product.id === removed.productId && line.size === removed.size)) return null;
  return (
    <div
      role="status"
      className="bg-secondary animate-in fade-in slide-in-from-bottom-2 mt-3 flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm duration-300"
    >
      <span className="min-w-0 truncate">Removed {removed.name}</span>
      <button
        type="button"
        className="text-brand shrink-0 font-semibold underline-offset-2 hover:underline"
        onClick={() => {
          add.mutate({ product_id: removed.productId, size: removed.size, quantity: removed.quantity });
          setRemoved(null);
        }}
      >
        Undo
      </button>
    </div>
  );
}

function CartLineItem({ line, onNavigate }: { line: CartLine; onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuth((state) => state.status);
  const setQuantity = useSetQuantity();
  const remove = useRemoveItem();
  const toggleWishlist = useToggleWishlist();
  const added = useCartDrawer((state) => state.added);
  const { product } = line;
  const soldOut = line.issue === "out_of_stock";
  // The line the shopper has just added glows once in the drawer.
  const isNew = added?.productId === product.id && added.size === line.size;

  // The undo bar sits inside the cart (a toast would be outside the open drawer, out of reach of
  // screen readers).
  const setRemoved = useCartDrawer((state) => state.setRemoved);
  const removeWithUndo = () => {
    // Set now, not when the server answers: by then this row is gone and its callbacks never run.
    setRemoved({ productId: product.id, size: line.size, quantity: line.quantity, name: product.name });
    remove.mutate(line.id);
  };

  const saveForLater = () => {
    if (status !== "signedIn") {
      toast("Sign in to save items for later.");
      router.push(`/login?next=${encodeURIComponent(pathname || "/cart")}`);
      return;
    }
    toggleWishlist.mutate(
      { product, saved: true },
      {
        onSuccess: () => {
          remove.mutate(line.id);
          toast(`Saved ${product.name} to your wishlist`);
        },
      },
    );
  };

  return (
    <m.li
      // Lines slide closed when removed instead of snapping away.
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      className={cn("flex gap-4 overflow-hidden py-5 first:pt-0", isNew && "animate-highlight")}
    >
      <Link href={productPath(product)} onClick={onNavigate} className="w-20 shrink-0 sm:w-24">
        <div className="tile aspect-[3/4] rounded-xl dark:bg-white">
          <ProductImage product={product} sizes="96px" className="mix-blend-multiply dark:mix-blend-normal" />
        </div>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={productPath(product)}
            onClick={onNavigate}
            className="line-clamp-2 text-[1.0625rem] leading-snug font-semibold hover:underline"
          >
            {product.name}
          </Link>
          <button
            type="button"
            aria-label={`Remove ${product.name} from your Bag`}
            onClick={removeWithUndo}
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        <p className="text-muted-foreground type-caption">
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
        {!soldOut && (
          <button
            type="button"
            onClick={saveForLater}
            disabled={toggleWishlist.isPending || remove.isPending}
            className="text-muted-foreground hover:text-foreground mt-1 inline-flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline disabled:opacity-50"
          >
            <Heart aria-hidden className="size-3" /> Save for later
          </button>
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
            className={cn("text-[1.0625rem] font-semibold", soldOut && "text-muted-foreground line-through")}
          />
        </div>
      </div>
    </m.li>
  );
}
