import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toHref, type ListingQuery } from "./filters";

/** Compact page list: 1 … 4 5 [6] 7 8 … 20. */
export function pageWindow(current: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, current - 1, current, current + 1]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

const ITEM =
  "inline-flex size-10 items-center justify-center rounded-full text-sm tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60";

export function Pagination({
  query,
  pages,
  path = "/products",
}: {
  query: ListingQuery;
  pages: number;
  path?: string;
}) {
  if (pages <= 1) return null;
  const current = Math.min(query.page, pages);
  const href = (page: number) => toHref(path, { ...query, page });
  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1">
      {current > 1 ? (
        <Link href={href(current - 1)} rel="prev" aria-label="Previous page" className={cn(ITEM, "hover:bg-muted")}>
          <ChevronLeft className="size-4" />
        </Link>
      ) : null}
      {pageWindow(current, pages).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} aria-hidden className="text-muted-foreground w-6 text-center">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-label={`Page ${p}`}
            aria-current={p === current ? "page" : undefined}
            className={cn(ITEM, p === current ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {p}
          </Link>
        ),
      )}
      {current < pages ? (
        <Link href={href(current + 1)} rel="next" aria-label="Next page" className={cn(ITEM, "hover:bg-muted")}>
          <ChevronRight className="size-4" />
        </Link>
      ) : null}
    </nav>
  );
}
