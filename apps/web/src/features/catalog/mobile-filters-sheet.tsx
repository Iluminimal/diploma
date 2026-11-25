"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSwipeDismiss } from "@/components/ui/use-swipe-dismiss";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FilterFields, type FilterGroup } from "./filter-fields";
import { activeFilterCount, type ListingQuery } from "./filters";
import type { CatalogFilterOptions } from "./product";
import { useListingNavigation } from "./use-listing-navigation";

/**
 * Утасны шүүлтүүрийн sheet. Эхний товшилтоор ачаална (`MobileFilters`-г хар): dialog library
 * хэрэгтэй.
 */
export function MobileFiltersSheet({
  options,
  query,
  defaultOpen,
  showCategories,
  groups,
}: {
  options: CatalogFilterOptions;
  query: ListingQuery;
  defaultOpen?: boolean;
  showCategories?: boolean;
  groups?: FilterGroup[];
}) {
  const t = useTranslations("catalog");
  const [open, setOpen] = useState(defaultOpen ?? false);
  const { apply } = useListingNavigation(query);
  const count = activeFilterCount(query);
  // Sheet-ийг гарчгаас нь доош татаж хаана.
  const swipe = useSwipeDismiss("y", () => setOpen(false), "[data-slot=sheet-header]");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="lg" className="lg:hidden">
          <SlidersHorizontal />
          {count > 0 ? t("filtersCount", { count }) : t("filters")}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[88dvh] gap-0 rounded-t-3xl" {...swipe}>
        <SheetHeader className="touch-none">
          <span aria-hidden className="bg-muted-foreground/30 mx-auto mb-2 h-1 w-10 rounded-full" />
          <SheetTitle>{t("filters")}</SheetTitle>
          <SheetDescription className="sr-only">{t("filtersDescription")}</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">
          <FilterFields
            options={options}
            value={query}
            onChange={apply}
            idPrefix="sheet"
            showCategories={showCategories}
            groups={groups}
          />
        </div>
        <SheetFooter className="border-border border-t">
          <Button size="lg" className="h-11 w-full" onClick={() => setOpen(false)}>
            {t("showResults")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
