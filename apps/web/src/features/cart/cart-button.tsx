"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCloseOnOtherFlyout } from "@/components/layout/bar-flyout";
import { BagGlyph, HEADER_CELL } from "@/components/layout/header-cell";
import { cn } from "@/lib/utils";
import { useBagPanel } from "./cart-ui-store";
import { useCart } from "./use-cart";

// Эхний ачаалалд оруулахгүй: ихэнх зочин cart нээдэггүй, самбар dialog library-г дагуулна.
// Хамгийн анх нээгдэх үед (энэ товч эсвэл "Add to cart") татагдана.
const BagPanel = dynamic(
  () => import("./bag-panel").then((m) => m.BagPanel),
  { ssr: false },
);

export function CartButton() {
  const { open, setOpen } = useBagPanel();
  const { data } = useCart();
  const pathname = usePathname();
  // Bar-ын доор өөр flyout (search, department цэс) нээгдэх, эсвэл хуудас солигдоход Bag хаагдана.
  const closeBag = useCallback(() => setOpen(false), [setOpen]);
  useCloseOnOtherFlyout("bag", closeBag);
  useEffect(() => closeBag(), [pathname, closeBag]);
  const trigger = useRef<HTMLButtonElement>(null);
  const [wanted, setWanted] = useState(false);
  if (open && !wanted) setWanted(true);
  const count = data?.item_count ?? 0;
  const label = count > 99 ? "99+" : String(count);
  const width = count > 0 ? Math.min(label.length, 3) : 0;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={cn(HEADER_CELL, "phone-bar-item")}
        data-cart-button
        aria-label={count ? `Bag, ${count} items` : "Bag"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {/* Badge-ийг энэ icon хайрцагт байрлуулдаг, apple.com шиг: бараатай үед bag зүүн тийш зай
            гаргана, хоёр, гурван тэмдэгтэд цаашаа. */}
        <span
          aria-hidden
          className={cn(
            "relative block h-12 w-[17px] transition-transform duration-300 ease-[cubic-bezier(.25,.1,.3,1)] md:h-11 md:w-3.5",
            width === 1 && "-translate-x-1 md:-translate-x-1.5",
            width === 2 && "-translate-x-2.5 md:-translate-x-[11px]",
            width === 3 && "-translate-x-[17px]",
          )}
        >
          <BagGlyph />
          {count > 0 && (
            <span
              // Тоо өөрчлөгдөхөд дахин mount хийж, pop animation-ыг дахин тоглуулна.
              key={count}
              className="animate-pop bg-foreground text-background absolute bottom-[13px] left-[22px] block h-[1.3em] min-w-[1.3em] rounded-full text-center text-[10px] leading-[1.3] tracking-[-0.008em] tabular-nums md:bottom-[11px] md:left-[15px]"
              style={width > 1 ? { paddingInline: "0.325em" } : undefined}
            >
              {label}
            </span>
          )}
        </span>
      </button>
      {wanted && (
        <BagPanel
          open={open}
          onOpenChange={setOpen}
          count={count}
          trigger={trigger}
        />
      )}
    </>
  );
}
