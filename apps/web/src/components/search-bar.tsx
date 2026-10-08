"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { suggestProducts } from "@/features/catalog/suggest";
import { formatPrice, productPath } from "@/features/catalog/product";
import { cn } from "@/lib/utils";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = useDebounced(text.trim(), DEBOUNCE_MS);
  const enabled = query.length >= MIN_CHARS;
  const { data: items = [], isFetching } = useQuery({
    queryKey: ["suggest", query],
    queryFn: ({ signal }) => suggestProducts(query, signal),
    enabled,
    staleTime: 60_000,
  });
  const showList = open && enabled && text.trim().length >= MIN_CHARS && (items.length > 0 || !isFetching);

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
    router.push(`/products?q=${encodeURIComponent(q)}`);
  }

  function go(index: number) {
    const item = items[index];
    if (!item) return submit(text);
    setOpen(false);
    router.push(productPath(item));
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
          placeholder="Search for “red floral dress”"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              // Only dismiss the suggestions: a search field would otherwise clear itself, and
              // a highlighted suggestion that is no longer shown must not be what Enter opens.
              if (showList) e.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if (e.key === "ArrowDown" && items.length) {
              e.preventDefault();
              setOpen(true);
              setActive((i) => (i + 1) % items.length);
            } else if (e.key === "ArrowUp" && items.length) {
              e.preventDefault();
              setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
            }
          }}
          className="bg-muted/70 placeholder:text-muted-foreground focus-visible:ring-ring/50 focus-visible:bg-background border-border h-10 w-full rounded-full border pr-4 pl-10 text-sm outline-none transition-colors focus-visible:ring-3"
        />
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="bg-popover border-border shadow-soft absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl border p-1.5"
        >
          {items.length === 0 ? (
            <li className="text-muted-foreground px-3 py-3 text-sm">No matches for “{query}”.</li>
          ) : (
            items.map((item, i) => (
              <li
                key={item.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerEnter={() => setActive(i)}
                onClick={() => go(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl p-2",
                  i === active && "bg-muted",
                )}
              >
                <Image
                  src={item.image.thumb_400}
                  alt=""
                  width={40}
                  height={53}
                  sizes="40px"
                  className="bg-muted h-[53px] w-10 rounded-md object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatPrice(item.price_cents, item.currency)}
                  </span>
                </span>
              </li>
            ))
          )}
          {items.length > 0 && (
            <li
              role="option"
              aria-selected={false}
              onClick={() => submit(text)}
              className="text-muted-foreground hover:text-foreground cursor-pointer rounded-xl px-3 py-2.5 text-sm"
            >
              See all results for “{query}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
