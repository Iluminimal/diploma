"use client";

import { FilterFields, type FilterGroup } from "./filter-fields";
import type { ListingQuery } from "./filters";
import type { CatalogFilterOptions } from "./product";
import { useListingNavigation } from "./use-listing-navigation";

/** The desktop filter column's contents: its own module, so phones never download it. */
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
