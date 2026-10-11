import { Camera, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { ProductGrid, ProductGridSkeleton } from "@/components/product-grid";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActiveFilters } from "./active-filters";
import { listProducts } from "./api";
import type { ListingQuery } from "./filters";
import type { FilterGroup } from "./filter-fields";
import { FilterSidebar, MobileFilters, SortSelect } from "./listing-controls";
import { Pagination } from "./pagination";
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
        <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h1>
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
          <div className="mb-5 flex items-center justify-between gap-3">
            <MobileFilters options={options} query={query} showCategories={showCategories} groups={groups} />
            <div className="ml-auto">
              <SortSelect query={query} />
            </div>
          </div>
          <div className="mb-6 empty:hidden">
            <ActiveFilters query={query} path={path} />
          </div>

          <Suspense key={JSON.stringify(query)} fallback={<ProductGridSkeleton count={12} />}>
            <Results query={query} path={path} />
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
      {total.toLocaleString("en-US")} {total === 1 ? "product" : "products"}
    </p>
  );
}

async function Results({ query, path }: { query: ListingQuery; path: string }) {
  const page = await listProducts(query);
  if (page.items.length === 0) return <EmptyState query={query} path={path} />;
  return (
    <>
      <ProductGrid products={page.items} columns={3} priorityCount={3} />
      <Pagination query={query} pages={page.pages} path={path} />
    </>
  );
}

function EmptyState({ query, path }: { query: ListingQuery; path: string }) {
  return (
    <div className="border-border flex flex-col items-center gap-4 rounded-3xl border border-dashed px-6 py-20 text-center">
      <SearchX className="text-muted-foreground size-8" />
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Nothing matches {query.q ? `“${query.q}”` : "these filters"}</h2>
        <p className="text-muted-foreground text-sm">Try removing a filter, or search with a photo instead.</p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="lg">
          <Link href={path}>Clear filters</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/search">
            <Camera /> Search by photo
          </Link>
        </Button>
      </div>
    </div>
  );
}
