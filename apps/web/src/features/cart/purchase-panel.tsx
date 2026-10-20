"use client";

import { Check, Loader2, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Price } from "@/components/product/price";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SizeSelector } from "@/features/catalog/size-selector";
import type { Product } from "@/features/catalog/product";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import { useBagPanel } from "./cart-ui-store";
import { flyToCart } from "./fly-to-cart";
import { useAddToCart } from "./use-cart";

type Props = {
  product: Product;
  /** `sizesFor`-оос: размергүй бүтээгдэхүүнд (цаг, цүнх г.м.) null. */
  sizes: { label: string; sizes: string[] } | null;
};

/** Размер сонголт, "Add to Bag", wishlist зүрх: бүтээгдэхүүний хуудасны интерактив хэсэг. */
export function PurchasePanel({ product, sizes }: Props) {
  const [size, setSize] = useState<string | null>(null);
  const [missingSize, setMissingSize] = useState(false);
  // Размер дутах бүрд нэмэгдэнэ, ингэснээр сэгсрэлт аль хэдийн явж байсан ч дахин эхэлнэ.
  const [shake, setShake] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const add = useAddToCart();
  const openDrawer = useBagPanel((state) => state.setOpen);
  const setAdded = useBagPanel((state) => state.setAdded);
  const buttonRow = useRef<HTMLDivElement>(null);
  const sizeBox = useRef<HTMLDivElement>(null);
  // Утсан дээр хуудас урт: үндсэн товч дэлгэцээс гармагц bar түүнийг гарт ойр байлгана.
  const [barVisible, setBarVisible] = useState(false);

  useEffect(() => {
    const row = buttonRow.current;
    if (!row || !product.in_stock) return;
    const observer = new IntersectionObserver(([entry]) => setBarVisible(entry ? !entry.isIntersecting : false));
    observer.observe(row);
    return () => observer.disconnect();
  }, [product.in_stock]);

  // Размеруудыг дахин mount хийж сэгсрэлтийг дахин эхлүүлдэг тул тэд буцмагц cursor орно.
  useEffect(() => {
    if (shake > 0) sizeBox.current?.querySelector("input")?.focus({ preventScroll: true });
  }, [shake]);

  // Товчны check mark түр байж, дараа нь дахин "Add to Bag" болно.
  useEffect(() => {
    if (!justAdded) return;
    const timer = window.setTimeout(() => setJustAdded(false), 1600);
    return () => window.clearTimeout(timer);
  }, [justAdded]);

  const addToCart = (pressed: HTMLElement | null) => {
    if (sizes && !size) {
      setMissingSize(true);
      setShake((count) => count + 1);
      // Bar-аас размер сонгогч дэлгэцийн гадна байна: буцааж авчирч, cursor-ыг түүнд оруулна.
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
        {justAdded ? `${product.name} was added to your Bag.` : ""}
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
        // Үндсэн товч дэлгэцээс гарахад дээш гулсаж гарна; бусад үед нуугдана (tab дарааллаас ч
        // гарна).
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
          // Үндсэн товчтой ижил нэр биш: screen reader энэ хуудсанд хоёуланг нь таарна.
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

/** Bag, дараа нь хүсэлт явах үед spinner, дараа нь pop хийж орох check mark. */
function AddIcon({ pending, added }: { pending: boolean; added: boolean }) {
  if (pending) return <Loader2 className="animate-spin" />;
  if (added) return <Check key="added" className="animate-pop" />;
  return <ShoppingBag />;
}
