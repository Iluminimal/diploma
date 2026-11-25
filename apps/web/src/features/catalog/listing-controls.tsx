"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import type { FilterGroup } from "./filter-fields";
import { activeFilterCount, type ListingQuery, type Sort } from "./filters";
import type { CatalogFilterOptions } from "./product";
import { useListingNavigation } from "./use-listing-navigation";
import { Skeleton } from "@/components/ui/skeleton";

// Утасны шүүлтүүрийн sheet-ийг анх нээхэд dialog library-тай хамт татна.
const MobileFiltersSheet = dynamic(() => import("./mobile-filters-sheet").then((m) => m.MobileFiltersSheet), {
  ssr: false,
});

// Утас sidebar харуулдаггүй тул хэзээ ч татахгүй.
const WideSidebar = dynamic(() => import("./sidebar-filters").then((m) => m.SidebarFilters), { ssr: false });

const DESKTOP = "(min-width: 64rem)";
const subscribeToWidth = (notify: () => void) => {
  const media = window.matchMedia(DESKTOP);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

/** Desktop-ийн шүүлтүүрийн багана. Нарийн дэлгэц дээр зурахгүй, ачаалахгүй. */
type FilterScope = { showCategories?: boolean; groups?: FilterGroup[] };

export function FilterSidebar({
  options,
  query,
  ...scope
}: { options: CatalogFilterOptions; query: ListingQuery } & FilterScope) {
  const wide = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
  if (!wide) return <Skeleton aria-hidden className="bg-muted/50 h-96 rounded-[var(--radius-tile)]" />;
  return <WideSidebar options={options} query={query} {...scope} />;
}

export function MobileFilters({
  options,
  query,
  ...scope
}: { options: CatalogFilterOptions; query: ListingQuery } & FilterScope) {
  const t = useTranslations("catalog");
  const [requested, setRequested] = useState(false);
  if (requested) return <MobileFiltersSheet options={options} query={query} defaultOpen {...scope} />;
  const count = activeFilterCount(query);
  return (
    <Button variant="outline" className="lg:hidden" aria-haspopup="dialog" onClick={() => setRequested(true)}>
      <SlidersHorizontal />
      {count > 0 ? t("filtersCount", { count }) : t("filters")}
    </Button>
  );
}

/** Native select: script ачаалахгүй, утсан дээр платформын өөрийн сонгогч, бүрэн a11y-тай. */
export function SortSelect({ query }: { query: ListingQuery }) {
  const t = useTranslations("catalog");
  const { apply } = useListingNavigation(query);
  const fallback: Sort = query.q ? "relevance" : "newest";
  const options: Sort[] = query.q
    ? ["relevance", "popular", "rating", "newest", "price_asc", "price_desc"]
    : ["newest", "popular", "rating", "price_asc", "price_desc"];
  return (
    <NativeSelect
      variant="pill"
      aria-label={t("sortBy")}
      className="min-w-44"
      value={query.sort ?? fallback}
      onChange={(event) => {
        const sort = event.target.value as Sort;
        apply({ ...query, sort: sort === fallback ? undefined : sort });
      }}
    >
      {options.map((sort) => (
        <option key={sort} value={sort}>
          {t(`sort.${sort}`)}
        </option>
      ))}
    </NativeSelect>
  );
}
