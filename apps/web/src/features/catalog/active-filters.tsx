import { X } from "lucide-react";
import Link from "next/link";
import { MULTI_KEYS, toHref, type ListingQuery } from "./filters";
import { formatPrice } from "./product";

/** Устгах боломжтой chip-үүд энгийн холбоос: client JS хэрэггүй, chip бүр тэр утгагүй URL. */
export function ActiveFilters({ query, path = "/products" }: { query: ListingQuery; path?: string }) {
  const chips: { label: string; href: string }[] = [];
  const without = (patch: Partial<ListingQuery>) => toHref(path, { ...query, ...patch, page: 1 });

  for (const key of MULTI_KEYS) {
    for (const value of query[key]) {
      chips.push({ label: value, href: without({ [key]: query[key].filter((v) => v !== value) }) });
    }
  }
  if (query.min_price !== undefined || query.max_price !== undefined) {
    const lo = query.min_price !== undefined ? formatPrice(query.min_price) : "any";
    const hi = query.max_price !== undefined ? formatPrice(query.max_price) : "any";
    chips.push({
      label: `${lo} – ${hi}`,
      href: without({ min_price: undefined, max_price: undefined }),
    });
  }
  if (query.in_stock) chips.push({ label: "In stock", href: without({ in_stock: false }) });
  if (query.q) chips.push({ label: `“${query.q}”`, href: without({ q: undefined, sort: query.sort === "relevance" ? undefined : query.sort }) });

  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.label + chip.href}>
          <Link
            href={chip.href}
            scroll={false}
            className="bg-secondary hover:bg-secondary/70 focus-visible:ring-ring/60 inline-flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-3.5 text-sm outline-none transition-colors focus-visible:ring-3"
          >
            {chip.label}
            <X className="text-muted-foreground size-3.5" />
            <span className="sr-only">Remove filter</span>
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={path}
          scroll={false}
          className="text-muted-foreground hover:text-foreground px-2 text-sm underline-offset-4 hover:underline"
        >
          Clear all
        </Link>
      </li>
    </ul>
  );
}
