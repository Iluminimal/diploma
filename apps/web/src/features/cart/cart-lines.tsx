"use client";

import { useTranslations } from "next-intl";
import { useFormat } from "@/i18n/use-format";
import { useVocab } from "@/i18n/use-vocab";
import { AnimatePresence, m } from "motion/react";
import { Heart, Trash2 } from "lucide-react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { EASE_OUT_EXPO } from "@/components/motion/easing";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Price } from "@/components/product/price";
import { ProductImage } from "@/components/product/product-image";
import { useAuth } from "@/features/auth/auth-store";
import { productPath, productSubtitle } from "@/features/catalog/product";
import { useToggleWishlist } from "@/features/wishlist/use-wishlist";
import { cn } from "@/lib/utils";
import type { Cart, CartLine } from "./cart-api";
import { useBagPanel } from "./cart-ui-store";
import { QuantityStepper } from "./quantity-stepper";
import { useAddToCart, useCart, useRemoveItem, useSetQuantity } from "./use-cart";

type Props = {
  cart: Cart;
  /** Бүтээгдэхүүний холбоос дагахад дуудна (Bag өөрөө хаагдана). */
  onNavigate?: () => void;
  className?: string;
};

export function CartLines({ cart, onNavigate, className }: Props) {
  const t = useTranslations("cart");
  return (
    <>
      <ul className={cn("divide-border divide-y", className)} aria-label={t("items")}>
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

/** "Removed Blue Kurta. Undo": мөрийг хасснаас хойш хэдэн секунд, cart дотроо. */
export function UndoBar() {
  const t = useTranslations("cart");
  const removed = useBagPanel((state) => state.removed);
  const setRemoved = useBagPanel((state) => state.setRemoved);
  const add = useAddToCart();
  const { data: cart } = useCart();

  useEffect(() => {
    if (!removed) return;
    const timer = window.setTimeout(() => setRemoved(null), 8000);
    return () => window.clearTimeout(timer);
  }, [removed, setRemoved]);

  if (!removed) return null;
  // Хасалт амжилтгүй болбол мөр cart-даа буцсан тул буцаах зүйл байхгүй.
  if (cart?.lines.some((line) => line.product.id === removed.productId && line.size === removed.size)) return null;
  return (
    <div
      role="status"
      className="bg-secondary animate-in fade-in slide-in-from-bottom-2 mt-3 flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 type-caption duration-300"
    >
      <span className="min-w-0 truncate">{t("removed", { name: removed.name })}</span>
      <button
        type="button"
        className="text-brand shrink-0 font-semibold underline-offset-2 hover:underline"
        onClick={() => {
          add.mutate({ product_id: removed.productId, size: removed.size, quantity: removed.quantity });
          setRemoved(null);
        }}
      >
        {t("undo")}
      </button>
    </div>
  );
}

function CartLineItem({ line, onNavigate }: { line: CartLine; onNavigate?: () => void }) {
  const t = useTranslations("cart");
  const vocab = useVocab();
  const format = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuth((state) => state.status);
  const setQuantity = useSetQuantity();
  const remove = useRemoveItem();
  const toggleWishlist = useToggleWishlist();
  const added = useBagPanel((state) => state.added);
  const { product } = line;
  const soldOut = line.issue === "out_of_stock";
  // Дөнгөж нэмсэн мөр Bag-д нэг удаа гэрэлтэнэ.
  const isNew = added?.productId === product.id && added.size === line.size;

  // Буцаах мөр cart дотор байна (toast нээлттэй Bag-ийн гадна байх тул screen reader хүрэхгүй).
  const setRemoved = useBagPanel((state) => state.setRemoved);
  const removeWithUndo = () => {
    // Одоо тавина, сервер хариулахад биш: тэр үед энэ мөр алга болсон, callback-ууд ажиллахгүй.
    setRemoved({ productId: product.id, size: line.size, quantity: line.quantity, name: product.name });
    remove.mutate(line.id);
  };

  const saveForLater = () => {
    if (status !== "signedIn") {
      toast(t("signInToSave"));
      router.push(`/login?next=${encodeURIComponent(pathname || "/cart")}`);
      return;
    }
    toggleWishlist.mutate(
      { product, saved: true },
      {
        onSuccess: () => {
          remove.mutate(line.id);
          toast(t("savedToWishlist", { name: product.name }));
        },
      },
    );
  };

  return (
    <m.li
      // Хасагдах мөр огцом алга болохын оронд гулсан хаагдана.
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
            className="line-clamp-2 type-body leading-snug font-semibold hover:underline"
          >
            {product.name}
          </Link>
          <button
            type="button"
            aria-label={t("removeItem", { name: product.name })}
            onClick={removeWithUndo}
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        <p className="text-muted-foreground type-caption">
          {line.size ? `${t("size", { size: line.size })} · ` : ""}
          {productSubtitle(product, vocab)}
        </p>
        {line.issue === "out_of_stock" && (
          <p role="status" className="text-destructive mt-1 type-fine font-medium">
            {t("soldOutRemove")}
          </p>
        )}
        {!soldOut && line.price_when_added_cents != null && line.price_when_added_cents !== line.unit_price_cents && (
          <p role="status" className="text-muted-foreground mt-1 type-fine">
            {t(line.unit_price_cents < line.price_when_added_cents ? "priceDropped" : "priceChanged", {
              price: format.price(line.price_when_added_cents, product.currency),
            })}
          </p>
        )}
        {line.issue === "low_stock" && (
          <p role="status" className="text-destructive mt-1 type-fine font-medium">
            {t("onlyLeft", { count: line.max_quantity })}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => setQuantity.mutate({ itemId: line.id, quantity: line.max_quantity })}
            >
              {t("updateTo", { count: line.max_quantity })}
            </button>
          </p>
        )}
        {!soldOut && (
          <button
            type="button"
            onClick={saveForLater}
            disabled={toggleWishlist.isPending || remove.isPending}
            className="text-muted-foreground hover:text-foreground mt-1 inline-flex w-fit items-center gap-1 type-fine underline-offset-2 hover:underline disabled:opacity-50"
          >
            <Heart aria-hidden className="size-3" /> {t("saveForLater")}
          </button>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          {soldOut ? (
            <span className="text-muted-foreground type-caption">{t("qty", { count: line.quantity })}</span>
          ) : (
            <QuantityStepper
              value={line.quantity}
              max={line.max_quantity}
              name={product.name}
              onChange={(quantity) => setQuantity.mutate({ itemId: line.id, quantity })}
            />
          )}
          <Price
            cents={line.line_total_cents}
            currency={product.currency}
            className={cn("type-body font-semibold", soldOut && "text-muted-foreground line-through")}
          />
        </div>
      </div>
    </m.li>
  );
}
