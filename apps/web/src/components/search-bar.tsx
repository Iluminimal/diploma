"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, Clock, LayoutGrid, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { categoryHref, matchCategories } from "@/features/catalog/nav";
import { readRecentSearches, rememberSearch } from "@/features/catalog/recent-searches";
import { formatPrice, productPath } from "@/features/catalog/product";
import { suggestProducts } from "@/features/catalog/suggest";
import { useCatalogNav } from "@/features/catalog/use-catalog-nav";
import { firstImage, useImageInput } from "@/features/search/use-image-input";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

// The picker (and the dialog library behind it) is fetched the first time someone asks for it.
const PhotoSearchDialog = dynamic(() => import("@/features/search/photo-search-dialog").then((m) => m.PhotoSearchDialog), {
  ssr: false,
});

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
const MAX_CATEGORIES = 3;

type Option =
  | { type: "recent"; key: string; label: string; href: string }
  | { type: "category"; key: string; label: string; context: string; count: number; href: string }
  | {
      type: "product";
      key: string;
      label: string;
      price: string;
      image: string;
      href: string;
    };

const searchHref = (q: string) => `/products?q=${encodeURIComponent(q)}`;

export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const photoButton = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const [photoRequested, setPhotoRequested] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { pick } = useImageInput();

  const typed = text.trim();
  const query = useDebounced(typed, DEBOUNCE_MS);
  const enabled = query.length >= MIN_CHARS;
  const { data: products = [], isFetching } = useQuery({
    queryKey: ["suggest", query],
    queryFn: ({ signal }) => suggestProducts(query, signal),
    enabled,
    staleTime: 60_000,
  });
  const { data: nav } = useCatalogNav(open);

  const options = useMemo<Option[]>(() => {
    if (typed.length === 0) {
      return recent.map((q) => ({ type: "recent", key: `r-${q}`, label: q, href: searchHref(q) }));
    }
    if (!enabled) return [];
    const categories: Option[] = nav
      ? matchCategories(nav, query, MAX_CATEGORIES).map(({ department, node }) => ({
          type: "category",
          key: `c-${department.slug}-${node.path}`,
          label: node.name,
          context: department.name,
          count: node.product_count,
          href: categoryHref(department.slug, node.path),
        }))
      : [];
    const items: Option[] = products.map((p) => ({
      type: "product",
      key: `p-${p.id}`,
      label: p.name,
      price: formatPrice(p.price_cents, p.currency),
      image: p.image.thumb_400,
      href: productPath(p),
    }));
    return [...categories, ...items];
  }, [typed, enabled, query, nav, products, recent]);

  const showList =
    open &&
    (typed.length === 0
      ? options.length > 0
      : enabled && typed.length >= MIN_CHARS && (options.length > 0 || !isFetching));
  const hasProducts = options.some((o) => o.type === "product");

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function submit(value: string) {
    const q = value.trim();
    if (!q) return;
    setOpen(false);
    setRecent(rememberSearch(q));
    router.push(searchHref(q));
  }

  function go(index: number) {
    const option = options[index];
    if (!option) return submit(text);
    setOpen(false);
    if (option.type === "recent") setRecent(rememberSearch(option.label));
    router.push(option.href);
  }

  async function searchWithPhoto(file: File | null) {
    if (file && (await pick(file))) {
      setOpen(false);
      router.push("/search");
    }
  }

  function onDrop(event: DragEvent) {
    const file = firstImage(event.dataTransfer.files);
    setDragging(false);
    if (!file) return;
    event.preventDefault();
    void searchWithPhoto(file);
  }

  function onPaste(event: ClipboardEvent) {
    const file = firstImage(event.clipboardData.files);
    if (!file) return;
    // Handled here: the page-wide paste listener (home page) must not take the same photo twice.
    event.preventDefault();
    event.stopPropagation();
    void searchWithPhoto(file);
  }

  function openPhotoSearch() {
    setOpen(false);
    setPhotoRequested(true);
    setPhotoOpen(true);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0) go(active);
          else submit(text);
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search products
        </label>
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
        />
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={dragging ? "Drop a photo to search" : "Search for “red floral dress”"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => {
            setRecent(readRecentSearches());
            setOpen(true);
          }}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              // Only dismiss the suggestions: a search field would otherwise clear itself, and
              // a highlighted suggestion that is no longer shown must not be what Enter opens.
              if (showList) e.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if (e.key === "ArrowDown" && options.length) {
              e.preventDefault();
              setOpen(true);
              setActive((i) => (i + 1) % options.length);
            } else if (e.key === "ArrowUp" && options.length) {
              e.preventDefault();
              setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
            }
          }}
          className={cn(
            "bg-muted/70 placeholder:text-muted-foreground focus-visible:ring-ring/50 focus-visible:bg-background border-border h-10 w-full rounded-full border pr-12 pl-10 text-sm outline-none transition-[background-color,box-shadow,border-color] duration-200 focus-visible:ring-3",
            dragging && "border-brand bg-brand/5 ring-brand/30 ring-3",
          )}
        />
        <button
          ref={photoButton}
          type="button"
          aria-label="Search by photo"
          aria-haspopup="dialog"
          title="Search by photo"
          onClick={openPhotoSearch}
          className="text-muted-foreground hover:text-foreground hover:bg-foreground/8 focus-visible:ring-ring/60 absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full outline-none transition-colors duration-200 focus-visible:ring-3"
        >
          <Camera aria-hidden className="size-4" />
        </button>
      </form>

      {photoRequested && (
        <PhotoSearchDialog
          open={photoOpen}
          onOpenChange={(next) => {
            setPhotoOpen(next);
            if (!next) requestAnimationFrame(() => photoButton.current?.focus());
          }}
        />
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="bg-popover border-border shadow-soft animate-in fade-in-0 slide-in-from-top-1 absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl border p-1.5 duration-200"
        >
          {options.map((option, i) => {
            const heading = options[i - 1]?.type !== option.type ? HEADINGS[option.type] : null;
            return (
              <li key={option.key} role="presentation">
                {heading && (
                  <p aria-hidden className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-medium">
                    {heading}
                  </p>
                )}
                <div
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => go(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl p-2 transition-colors duration-150",
                    i === active && "bg-muted",
                  )}
                >
                  <OptionBody option={option} />
                </div>
              </li>
            );
          })}
          {typed.length >= MIN_CHARS && options.length === 0 && (
            <li role="presentation" className="text-muted-foreground px-3 py-3 text-sm">
              No matches for “{query}”.
            </li>
          )}
          {hasProducts && (
            <li role="presentation">
              <div
                role="option"
                aria-selected={false}
                onClick={() => submit(text)}
                className="text-muted-foreground hover:text-foreground cursor-pointer rounded-xl px-3 py-2.5 text-sm"
              >
                See all results for “{query}”
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

const HEADINGS: Record<Option["type"], string> = {
  recent: "Recent searches",
  category: "Categories",
  product: "Products",
};

function OptionBody({ option }: { option: Option }) {
  if (option.type === "product") {
    return (
      <>
        <Image
          src={option.image}
          alt=""
          width={40}
          height={53}
          sizes="40px"
          className="bg-muted h-[53px] w-10 rounded-md object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{option.label}</span>
          <span className="text-muted-foreground block text-xs">{option.price}</span>
        </span>
      </>
    );
  }
  const Icon = option.type === "recent" ? Clock : LayoutGrid;
  return (
    <>
      <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-md">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {option.label}
        {option.type === "category" && <span className="text-muted-foreground font-normal"> in {option.context}</span>}
      </span>
      {option.type === "category" && (
        <span className="text-muted-foreground text-xs tabular-nums">{option.count.toLocaleString("en-US")}</span>
      )}
    </>
  );
}
