"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { activeFilterCount, type ListingQuery } from "./filters";
import type { CatalogFilterOptions } from "./product";
import { useListingNavigation } from "./use-listing-navigation";

/** The phone filter sheet. Loaded on first tap (see `MobileFilters`): it needs the dialog library. */
export function MobileFiltersSheet({
  options,
  query,
  defaultOpen,
}: {
  options: CatalogFilterOptions;
  query: ListingQuery;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
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
