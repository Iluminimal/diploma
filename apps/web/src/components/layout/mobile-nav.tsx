"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { HEADER_CELL } from "@/components/layout/header-cell";
import { cn } from "@/lib/utils";
import { useBarPanel } from "./bar-panel";

// Цэсний panel (ачаалдаг ангилалтай нь) товчийг анх дарахад ачаалагдана.
const MobileMenuPanel = dynamic(() => import("./mobile-nav-menu").then((m) => m.MobileMenuPanel), { ssr: false });

/** X болж хувирдаг хоёр нарийн шугам, apple.com-ийн цэсний товч шиг. */
function MenuIcon({ open }: { open: boolean }) {
  const line = "absolute left-0 h-px w-full rounded-full bg-current transition-transform duration-300 ease-out-expo";
  return (
    <span aria-hidden className="relative block h-[12px] w-[17px]">
      <span className={cn(line, "top-[3px]", open && "translate-y-[3px] rotate-45")} />
      <span className={cn(line, "top-[9px]", open && "-translate-y-[3px] -rotate-45")} />
    </span>
  );
}

/**
 * Утасны header-ийн цэсний товч, мөрийн сүүлд (logo, хайлт, bag, цэс), apple.com шиг. Дарахад
 * шугамууд X болж, bar-ын үлдсэн хэсэг бүдгэрч, доор нь холбоосын бүтэн хуудас нээгдэнэ; дахин
 * дарах (эсвэл Escape, холбоос дагах) хаана. Навигацийн дараа effect-гүйгээр хаагдсан гэж
 * тооцогдоно: нээсэн хуудсаа санадаг.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const open = openedAt !== null && openedAt === pathname;
  // Тогтвортой: panel-ийн effect үүнээс хамаарах тул render бүрт дахин ажиллах ёсгүй.
  const close = useCallback(() => setOpenedAt(null), []);
  useBarPanel(open);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => {
          setRequested(true);
          setOpenedAt(open ? null : pathname);
        }}
        className={cn(HEADER_CELL, "md:hidden")}
      >
        <MenuIcon open={open} />
      </button>
      {requested && <MobileMenuPanel open={open} onClose={close} trigger={button} />}
    </>
  );
}
