"use client";

import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { flyToBag } from "@/components/motion/fly-to-bag";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsStaff } from "@/features/auth/use-role";
import type { Product } from "@/features/catalog/product";
import { SizeSelector } from "@/features/catalog/size-selector";
import { sizesFor } from "@/features/catalog/sizes";
import { cn } from "@/lib/utils";
import { useBagPanel } from "./cart-ui-store";
import { useAddToCart } from "./use-cart";

/**
 * Картаас шууд сагсанд нэмэх: размергүй бараа нэг товшилтоор, размертай бол размерын жижиг цонх
 * нээгдэж, размер сонгосон даруйд нэмэгдэнэ. Нэмсний дараа bag panel нээгдэж юу нэмэгдсэнийг
 * харуулна (барааны хуудастай адил). Ажилтанд (худалдан авалт хийхгүй) болон дууссан бараанд
 * харагдахгүй. Дэлгэц хулгана-гүй (утас) үед үргэлж харагдана; хулгана-тай үед карт дээр очиход.
 */
export function QuickAdd({ product, className }: { product: Product; className?: string }) {
  const t = useTranslations("catalog.quickAdd");
  const isStaff = useIsStaff();
  const add = useAddToCart();
  const openBag = useBagPanel((state) => state.setOpen);
  const setAdded = useBagPanel((state) => state.setAdded);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sizes = sizesFor(product);
  if (isStaff || !product.in_stock) return null;

  const submit = (size: string) => {
    add.mutate(
      { product_id: product.id, size, quantity: 1 },
      {
        onSuccess: () => {
          flyToBag(trigger.current?.closest("article")?.querySelector("[data-card-photo] img"));
          setOpen(false);
          setAdded({ productId: product.id, size });
          openBag(true);
        },
      },
    );
  };

  const button = (
    <button
      ref={trigger}
      type="button"
      aria-label={t("open", { name: product.name })}
      disabled={add.isPending}
      onClick={sizes ? undefined : () => submit("")}
      className={cn(
        "bg-background/90 text-foreground hover:bg-background focus-visible:ring-ring/50 grid size-10 place-items-center rounded-full shadow-sm backdrop-blur outline-none transition-[opacity,background-color] focus-visible:ring-3 disabled:opacity-60",
        // Hover-тэй төхөөрөмж дээр карт дээр очиход, эсвэл focus-д; утсан дээр үргэлж.
        "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 data-[state=open]:opacity-100",
        className,
      )}
    >
      {add.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-5" />}
    </button>
  );

  if (!sizes) return button;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-auto max-w-[min(20rem,calc(100vw-2rem))] gap-0 p-4">
        <SizeSelector
          label={t("chooseSize", { name: product.name })}
          sizes={sizes.sizes}
          value={null}
          onChange={submit}
        />
      </PopoverContent>
    </Popover>
  );
}
