"use client";

import { SlidersHorizontal, X } from "lucide-react";
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
import { FilterFields } from "@/features/catalog/filter-fields";
import { toggleValue, type CatalogFilters, type MultiKey } from "@/features/catalog/filters";
import { formatPrice, type CatalogFilterOptions } from "@/features/catalog/product";
import { cn } from "@/lib/utils";

type Props = {
  options: CatalogFilterOptions;
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
};

const SECONDARY: MultiKey[] = ["color", "season", "usage"];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/60 h-9 shrink-0 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3",
        active ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Шуурхай шүүлтүүр chip (хүйс, нөөц), бусдад sheet, хэрэглэгдсэнд устгах боломжтой chip. */
export function SearchFilterBar({ options, filters, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const removable: { label: string; remove: () => void }[] = [];
  for (const key of SECONDARY) {
    for (const value of filters[key]) {
      removable.push({ label: value, remove: () => onChange(toggleValue(filters, key, value)) });
    }
  }
  if (filters.min_price !== undefined || filters.max_price !== undefined) {
    const lo = filters.min_price !== undefined ? formatPrice(filters.min_price) : "any";
    const hi = filters.max_price !== undefined ? formatPrice(filters.max_price) : "any";
    removable.push({
      label: `${lo} – ${hi}`,
      remove: () => onChange({ ...filters, min_price: undefined, max_price: undefined }),
    });
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Filters" className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {options.genders.map((g) => (
          <Chip key={g} active={filters.gender.includes(g)} onClick={() => onChange(toggleValue(filters, "gender", g))}>
            {g}
          </Chip>
        ))}
        <Chip active={filters.in_stock} onClick={() => onChange({ ...filters, in_stock: !filters.in_stock })}>
          In stock
        </Chip>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="shrink-0">
              <SlidersHorizontal /> More filters
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full gap-0 sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>More filters</SheetTitle>
              <SheetDescription className="sr-only">Colour, price, season and occasion.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4">
              <FilterFields
                options={options}
                value={filters}
                onChange={onChange}
                showCategories={false}
                groups={["color", "price", "season", "usage"]}
                idPrefix="vs"
              />
            </div>
            <SheetFooter className="border-border border-t">
              <Button size="lg" className="h-11 w-full" onClick={() => setOpen(false)}>
                Done
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
      {removable.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Applied filters">
          {removable.map((chip) => (
            <li key={chip.label}>
              <button
                type="button"
                onClick={chip.remove}
                className="bg-secondary hover:bg-secondary/70 focus-visible:ring-ring/60 inline-flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-3.5 text-sm outline-none focus-visible:ring-3"
              >
                {chip.label}
                <X className="text-muted-foreground size-3.5" />
                <span className="sr-only">Remove filter</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
