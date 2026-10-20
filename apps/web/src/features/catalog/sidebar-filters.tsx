"use client";

import { FilterFields, type FilterGroup } from "./filter-fields";
import type { ListingQuery } from "./filters";
import type { CatalogFilterOptions } from "./product";
import { useListingNavigation } from "./use-listing-navigation";

/** Desktop шүүлтүүрийн баганын агуулга: тусдаа module тул утас хэзээ ч татахгүй. */
export function SidebarFilters({
  options,
  query,
  showCategories,
  groups,
}: {
  options: CatalogFilterOptions;
  query: ListingQuery;
  showCategories?: boolean;
  groups?: FilterGroup[];
}) {
  const { apply } = useListingNavigation(query);
  return (
    <FilterFields
      options={options}
      value={query}
      onChange={apply}
      idPrefix="side"
      showCategories={showCategories}
      groups={groups}
    />
  );
}
