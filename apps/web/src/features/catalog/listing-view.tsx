import { Camera, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { ProductGrid, ProductGridSkeleton } from "@/components/product/product-grid";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatedCount } from "@/components/motion/animated-count";
import { Skeleton } from "@/components/ui/skeleton";
import { ActiveFilters } from "./active-filters";
import { listProducts } from "./api";
import type { ListingQuery } from "./filters";
import type { FilterGroup } from "./filter-fields";
import { FilterSidebar, MobileFilters, SortSelect } from "./listing-controls";
import { Pagination } from "./pagination";
import { PendingResults } from "./pending-results";
import type { CatalogFilterOptions } from "./product";

type Props = {
  title: string;
  /** The URL this listing lives at: filters, sorting and pages are links back to it. */
  path: string;
  query: ListingQuery;
  options: CatalogFilterOptions;
  /** Above the heading (breadcrumbs). */
  above?: ReactNode;
  /** Between the heading and the grid (sub-category chips). */
  chips?: ReactNode;
  /** Top of the desktop sidebar (the category drill-down). */
  asideTop?: ReactNode;
  /** The checkbox category tree only makes sense where the path does not already pick a category. */
  showCategories?: boolean;
  groups?: FilterGroup[];
};

/** Heading, filter sidebar, sort and paged product grid, shared by /products and /c/... */
export function ListingView({
  title,
  path,
  query,
  options,
  above,
  chips,
  asideTop,
  showCategories = true,
  groups,
}: Props) {
  return (
    <div className="container-page py-8 md:py-12">
      {above}
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-4xl font-semibold tracking-tighter text-balance md:text-5xl">{title}</h1>
        <Suspense fallback={<Skeleton className="h-5 w-24" />}>
          <ResultCount query={query} />
        </Suspense>
      </div>
      {chips}

      <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-3">
            {asideTop}
            <FilterSidebar options={options} query={query} showCategories={showCategories} groups={groups} />
          </div>
        </aside>

        <section aria-label="Products" className="min-w-0">
          {/* On a phone the filter and sort buttons stay under the header while the grid scrolls. */}
          <div className="bg-background/85 sticky-under-header sticky top-(--header-offset) z-20 -mx-4 mb-5 flex items-center justify-between gap-3 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:p-0">
            <MobileFilters options={options} query={query} showCategories={showCategories} groups={groups} />
            <div className="ml-auto">
              <SortSelect query={query} />
            </div>
          </div>
          <div className="mb-6 empty:hidden">
            <ActiveFilters query={query} path={path} />
          </div>

          {/* No key on the boundary: a changed filter keeps the old grid (dimmed) rather than a skeleton. */}
          <Suspense fallback={<ProductGridSkeleton count={12} />}>
            <PendingResults>
              <Results query={query} path={path} />
            </PendingResults>
          </Suspense>
        </section>
      </div>
    </div>
  );
}

async function ResultCount({ query }: { query: ListingQuery }) {
  const { total } = await listProducts(query);
  return (
    <p className="text-muted-foreground h-5 text-sm" aria-live="polite">
      <AnimatedCount value={total} /> {total === 1 ? "product" : "products"}
    </p>
  );
}

async function Results({ query, path }: { query: ListingQuery; path: string }) {
  const page = await listProducts(query);
  if (page.items.length === 0) return <NoResults query={query} path={path} />;
  return (
    <>
      <ProductGrid products={page.items} columns={3} priorityCount={3} />
      <Pagination query={query} pages={page.pages} path={path} />
    </>
  );
}

function NoResults({ query, path }: { query: ListingQuery; path: string }) {
  return (
    <EmptyState
      icon={SearchX}
      bordered
      title={`Nothing matches ${query.q ? `“${query.q}”` : "these filters"}`}
      description="Try removing a filter, or search with a photo instead."
    >
      <Button asChild variant="outline" size="lg">
        <Link href={path}>Clear filters</Link>
      </Button>
      <Button asChild size="lg">
        <Link href="/search">
          <Camera /> Search by photo
        </Link>
      </Button>
    </EmptyState>
  );
}
