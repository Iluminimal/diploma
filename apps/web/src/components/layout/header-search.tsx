"use client";

import { ArrowRight, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { HEADER_CELL, SearchGlyph } from "@/components/layout/header-cell";
import { DEPARTMENT_LINKS, categoryHref } from "@/features/catalog/nav";
import { announceFlyout, useCloseOnOtherFlyout } from "./bar-flyout";
import { useBarPanel } from "./bar-panel";

// Хайлтын талбар, санал болголт, зураг сонгогч хайлт анх нээгдэхэд ачаалагдана.
const SearchBar = dynamic(() => import("./search-bar").then((m) => m.SearchBar), { ssr: false });

const QUICK_LINKS = [
  ...DEPARTMENT_LINKS.map((d) => ({ href: categoryHref(d.slug), label: d.label })),
  { href: "/products?sort=newest", label: "New arrivals" },
  { href: "/search", label: "Search with a photo" },
] as const;

function QuickLinks({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav aria-label="Quick links" className="mt-8">
      <p className="flyout-item text-muted-foreground mb-3 text-xs" style={{ "--i": 1 } as CSSProperties}>
        Quick Links
      </p>
      <ul className="space-y-1 md:space-y-0">
        {QUICK_LINKS.map((link, i) => (
          <li key={link.href} className="flyout-item" style={{ "--i": i + 2 } as CSSProperties}>
            <Link
              href={link.href}
              onClick={onNavigate}
              className="hover:text-brand focus-visible:ring-ring/60 -mx-2 inline-flex items-center gap-3 rounded-md px-2 py-1 text-lg font-semibold tracking-tight outline-none transition-colors focus-visible:ring-3 md:py-1.5 md:text-xs md:leading-4 md:tracking-normal"
            >
              <ArrowRight aria-hidden strokeWidth={1.5} className="text-muted-foreground size-4 shrink-0 md:size-3" />
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Apple-ийн хайлтын арга: bar дахь томруулагч том талбар ба шуурхай холбоостой panel нээнэ. Md-ээс
 * дээш bar-ын доор дэлгэцийг дүүргэж, bar үлдэнэ (томруулагч дахин хаана, Escape ба өөр flyout
 * нээгдэхэд ч мөн хаагдана); утсан дээр bar-ыг ч бүрхэж зөвхөн X нь үлдэнэ. Panel нь <body> руу
 * portal хийгддэг: header-ийн backdrop blur нь доторх `fixed` бүх зүйлийн containing block
 * болчихно.
 */
export function HeaderSearch() {
  const pathname = usePathname();
  // Хаана нээснээ санана: навигацийн дараа effect-гүйгээр хаагдсан гэж тооцогдоно.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const open = openedAt !== null && openedAt === pathname;

  const close = () => setOpenedAt(null);
  useBarPanel(open);
  useCloseOnOtherFlyout("search", close);

  // Escape focus хаана байсан ч panel-ийг хаана (panel доторх focus-ыг panel-ийн өөрийн handler
  // барина).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenedAt(null);
      button.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // "/" дарахад хаанаас ч хайлт эхэлнэ, GitHub, apple.com шиг. Талбарт бичиж байх үед биш (тэнд
  // налуу зураас нь тэмдэгт), dialog дотор биш, modifier товч дарсан үед биш.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, [role="dialog"], [role="combobox"]')) return;
      event.preventDefault();
      setRequested(true);
      setOpenedAt(pathname);
      announceFlyout("search");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname]);
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      button.current?.focus();
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={cn(HEADER_CELL, "phone-bar-item")}
        aria-label="Search"
        title="Search (press /)"
        aria-keyshortcuts="/"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="search-panel"
        onClick={() => {
          setRequested(true);
          setOpenedAt(open ? null : pathname);
          if (!open) announceFlyout("search");
        }}
      >
        <SearchGlyph />
      </button>
      {requested &&
        createPortal(
          <>
            <div
              id="search-panel"
              role="dialog"
              aria-label="Search"
              data-open={open}
              inert={!open}
              onKeyDown={onKeyDown}
              className="search-panel bg-background fixed inset-x-0 top-0 z-50 h-dvh overflow-y-auto overscroll-contain pb-10 md:top-[2.8125rem] md:z-30 md:h-auto md:max-h-[calc(100dvh-2.8125rem)] md:bg-[var(--flyout)] md:pt-8 md:pb-20"
            >
              <div className="container-nav">
                {/* Утсан дээр apple.com шиг: bar-д зөвхөн X байх бөгөөд цэсийн товчны оронд орно
                   (logo, хайлт, bag алга), талбар нь доорх тусдаа мөрөнд. Md-ээс дээш X байхгүй:
                   bar үлдэж, түүний томруулагч panel-ийг хаана. */}
                <div className="flex h-12 items-center justify-end md:hidden">
                  <button type="button" className={HEADER_CELL} aria-label="Close search" onClick={close}>
                    <X className="size-[18px]" strokeWidth={1.25} />
                  </button>
                </div>
                <div className="pt-1 md:pt-0">
                  <div className="mx-auto w-full max-w-2xl md:mx-0 md:max-w-none">
                    <SearchBar variant="overlay" onNavigate={close} quickLinks={<QuickLinks onNavigate={close} />} />
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
