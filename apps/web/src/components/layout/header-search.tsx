"use client";

import { X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { HEADER_CELL, SearchGlyph } from "@/components/layout/header-cell";
import { AngelLogo } from "@/components/layout/logo";
import { DEPARTMENT_LINKS, categoryHref } from "@/features/catalog/nav";
import { useSearchPanel } from "./search-ui-store";

// The search field, its suggestions and the photo picker are fetched the first time search opens.
const SearchBar = dynamic(() => import("./search-bar").then((m) => m.SearchBar), { ssr: false });

const QUICK_LINKS = [
  ...DEPARTMENT_LINKS.map((d) => ({ href: categoryHref(d.slug), label: d.label })),
  { href: "/products?sort=newest", label: "New arrivals" },
  { href: "/search", label: "Search with a photo" },
] as const;

function QuickLinks({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav aria-label="Quick links" className="mt-8">
      <p className="text-muted-foreground mb-3 text-xs font-medium">Quick links</p>
      <ul className="space-y-1">
        {QUICK_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onNavigate}
              className="hover:text-brand focus-visible:ring-ring/60 -mx-2 inline-flex items-center gap-2 rounded-md px-2 py-1 text-lg font-semibold tracking-tight outline-none transition-colors focus-visible:ring-3"
            >
              <span aria-hidden className="text-muted-foreground">›</span>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Apple's way of searching: a magnifier in the bar opens a full-width panel over it, with a large
 * field and quick links, and dims the page behind. The panel is portalled to <body>: the header's
 * backdrop blur would otherwise become the containing block of anything `fixed` inside it.
 */
export function HeaderSearch() {
  const pathname = usePathname();
  // Remember where it was opened: after a navigation it counts as closed, without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const open = openedAt !== null && openedAt === pathname;

  // Another part of the page (the phone tab bar) asked for the panel.
  const requests = useSearchPanel((state) => state.requests);
  const [handled, setHandled] = useState(requests);
  if (requests !== handled) {
    setHandled(requests);
    setRequested(true);
    setOpenedAt(pathname);
  }

  const close = () => setOpenedAt(null);

  // Escape closes the panel wherever focus is (the panel's own handler covers focus inside it).
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

  // Press "/" anywhere to start searching, like on GitHub or apple.com. Not while typing in a field
  // (a slash is a character there), not inside a dialog, and not with a modifier key held.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, [role="dialog"], [role="combobox"]')) return;
      event.preventDefault();
      setRequested(true);
      setOpenedAt(pathname);
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
        className={HEADER_CELL}
        aria-label="Search"
        title="Search (press /)"
        aria-keyshortcuts="/"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="search-panel"
        onClick={() => {
          setRequested(true);
          setOpenedAt(open ? null : pathname);
        }}
      >
        <SearchGlyph />
      </button>
      {requested &&
        createPortal(
          <>
            <div aria-hidden data-open={open} onClick={close} className="search-scrim fixed inset-0 z-40" />
            <div
              id="search-panel"
              role="dialog"
              aria-label="Search"
              data-open={open}
              inert={!open}
              onKeyDown={onKeyDown}
              className="search-panel bg-background fixed inset-x-0 top-0 z-50 max-h-dvh overflow-y-auto pb-10"
            >
              <div className="container-page">
                {/* On a phone, as on apple.com: a row like the header with the logo and the X where the
                    menu button was, and the field on a row of its own below. From md up the X sits
                    beside the field. */}
                <div className="flex h-12 items-center justify-between md:hidden">
                  <Link href="/" onClick={close} className="focus-visible:ring-ring/60 rounded-md text-[1.0625rem] outline-none focus-visible:ring-3">
                    <AngelLogo showName={false} markClassName="size-7" />
                  </Link>
                  <button type="button" className={HEADER_CELL} aria-label="Close search" onClick={close}>
                    <X className="size-[18px]" strokeWidth={1.25} />
                  </button>
                </div>
                <div className="flex items-start gap-3 pt-1 md:pt-4">
                  <div className="mx-auto w-full max-w-2xl flex-1 md:pl-12">
                    <SearchBar variant="overlay" onNavigate={close} quickLinks={<QuickLinks onNavigate={close} />} />
                  </div>
                  <button type="button" className={cn(HEADER_CELL, "hidden md:grid")} aria-label="Close search" onClick={close}>
                    <X className="size-[18px]" strokeWidth={1.25} />
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
