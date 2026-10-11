"use client";

import { Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { DEPARTMENT_LINKS, categoryHref } from "@/features/catalog/nav";

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

  const close = () => setOpenedAt(null);
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      button.current?.focus();
    }
  }

  return (
    <>
      <Button
        ref={button}
        variant="ghost"
        size="icon"
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="search-panel"
        onClick={() => {
          setRequested(true);
          setOpenedAt(open ? null : pathname);
        }}
      >
        <Search />
      </Button>
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
              <div className="container-page flex items-start gap-3 pt-3 md:pt-4">
                <div className="mx-auto w-full max-w-2xl flex-1 md:pl-12">
                  <SearchBar variant="overlay" onNavigate={close} quickLinks={<QuickLinks onNavigate={close} />} />
                </div>
                <Button variant="ghost" size="icon-lg" aria-label="Close search" onClick={close}>
                  <X />
                </Button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
