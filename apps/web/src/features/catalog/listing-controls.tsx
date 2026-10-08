"use client";

import { SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import { selectClass } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { activeFilterCount, type ListingQuery, type Sort } from "./filters";
import type { CatalogFilterOptions } from "./product";
import { useListingNavigation } from "./use-listing-navigation";

// The phone filter sheet is fetched the first time it is opened, together with the dialog library.
const MobileFiltersSheet = dynamic(() => import("./mobile-filters-sheet").then((m) => m.MobileFiltersSheet), {
  ssr: false,
});

const SORT_LABELS: Record<Sort, string> = {
  relevance: "Most relevant",
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

// Phones never show the sidebar, so they never download it.
const WideSidebar = dynamic(() => import("./sidebar-filters").then((m) => m.SidebarFilters), { ssr: false });

const DESKTOP = "(min-width: 64rem)";
const subscribeToWidth = (notify: () => void) => {
  const media = window.matchMedia(DESKTOP);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

/** The desktop filter column. On a narrow screen nothing is rendered or loaded for it. */
export function FilterSidebar({ options, query }: { options: CatalogFilterOptions; query: ListingQuery }) {
  const wide = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
  if (!wide) return <div aria-hidden className="bg-muted/50 h-96 animate-pulse rounded-2xl" />;
  return <WideSidebar options={options} query={query} />;
}

export function MobileFilters({ options, query }: { options: CatalogFilterOptions; query: ListingQuery }) {
  const [requested, setRequested] = useState(false);
  if (requested) return <MobileFiltersSheet options={options} query={query} defaultOpen />;
  const count = activeFilterCount(query);
  return (
    <Button variant="outline" size="lg" className="lg:hidden" aria-haspopup="dialog" onClick={() => setRequested(true)}>
      <SlidersHorizontal />
      Filters{count > 0 && ` (${count})`}
    </Button>
  );
}

/** A native select: no script to load, the platform's own picker on phones, and fully accessible. */
export function SortSelect({ query }: { query: ListingQuery }) {
  const { apply } = useListingNavigation(query);
  const fallback: Sort = query.q ? "relevance" : "newest";
  const options: Sort[] = query.q
    ? ["relevance", "newest", "price_asc", "price_desc"]
    : ["newest", "price_asc", "price_desc"];
  return (
    <select
      aria-label="Sort by"
      className={cn(selectClass, "h-9 w-auto min-w-44 rounded-lg py-0 text-sm")}
      value={query.sort ?? fallback}
      onChange={(event) => {
        const sort = event.target.value as Sort;
        apply({ ...query, sort: sort === fallback ? undefined : sort });
      }}
    >
      {options.map((sort) => (
        <option key={sort} value={sort}>
          {SORT_LABELS[sort]}
        </option>
      ))}
    </select>
  );
}
