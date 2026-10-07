"use client";

import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FilterFields } from "./filter-fields";
import {
  activeFilterCount,
  toHref,
  type ListingQuery,
  type Sort,
} from "./filters";
import type { CatalogFilterOptions } from "./product";

const SORT_LABELS: Record<Sort, string> = {
  relevance: "Most relevant",
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

/** URL is the single source of truth: every change is a `replace` navigation with page reset. */
function useListingNavigation(query: ListingQuery) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function apply(next: ListingQuery) {
    startTransition(() => {
      router.replace(toHref(pathname, { ...next, page: 1 }), { scroll: false });
    });
  }
  return { apply, pending, query };
}

export function FilterSidebar({
  options,
  query,
}: {
  options: CatalogFilterOptions;
  query: ListingQuery;
}) {
  const { apply } = useListingNavigation(query);
  return (
    <FilterFields
      options={options}
      value={query}
      onChange={apply}
      idPrefix="side"
    />
  );
}

export function MobileFilters({
  options,
  query,
}: {
  options: CatalogFilterOptions;
  query: ListingQuery;
}) {
  const [open, setOpen] = useState(false);
  const { apply } = useListingNavigation(query);
  const count = activeFilterCount(query);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="lg" className="lg:hidden">
          <SlidersHorizontal />
          Filters{count > 0 && ` (${count})`}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[88dvh] gap-0 rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription className="sr-only">Narrow down the products shown.</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">
          <FilterFields options={options} value={query} onChange={apply} idPrefix="sheet" />
        </div>
        <SheetFooter className="border-border border-t">
          <Button size="lg" className="h-11 w-full" onClick={() => setOpen(false)}>
            Show results
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function SortSelect({ query }: { query: ListingQuery }) {
  const { apply } = useListingNavigation(query);
  const fallback: Sort = query.q ? "relevance" : "newest";
  const options: Sort[] = query.q
    ? ["relevance", "newest", "price_asc", "price_desc"]
    : ["newest", "price_asc", "price_desc"];
  return (
    <Select
      value={query.sort ?? fallback}
      onValueChange={(v) => apply({ ...query, sort: v === fallback ? undefined : (v as Sort) })}
    >
      <SelectTrigger aria-label="Sort by" className="h-9 min-w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {SORT_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
