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
  /** Энэ жагсаалтын URL: шүүлтүүр, эрэмбэ, хуудас нь түүн рүү буцах холбоос. */
  path: string;
  query: ListingQuery;
  options: CatalogFilterOptions;
  /** Гарчгийн дээр (breadcrumbs). */
  above?: ReactNode;
  /** Гарчиг ба grid-ийн хооронд (дэд ангиллын chip). */
  chips?: ReactNode;
  /** Desktop sidebar-ын дээд хэсэг (ангиллын drill-down). */
  asideTop?: ReactNode;
  /** Checkbox ангиллын мод нь зам ангиллыг сонгоогүй үед л утгатай. */
  showCategories?: boolean;
  groups?: FilterGroup[];
};

/**
 * Гарчиг, шүүлтүүрийн sidebar, эрэмбэ, хуудаслалттай бүтээгдэхүүний grid; /products болон /c/...
 * хоёрт нийтлэг.
 */
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
      <div className="mb-6 flex flex-col gap-1 md:mb-8">
        <h1 className="type-display text-balance">{title}</h1>
        <Suspense fallback={<Skeleton className="h-6 w-28" />}>
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
          {/* Утсан дээр grid гүйлгэх үед шүүлтүүр, эрэмбийн товч header-ийн доор үлдэнэ. */}
          <div className="bg-background/85 sticky top-12 z-20 -mx-4 mb-5 flex items-center justify-between gap-3 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:p-0">
            <MobileFilters options={options} query={query} showCategories={showCategories} groups={groups} />
            <div className="ml-auto">
              <SortSelect query={query} />
            </div>
          </div>
          <div className="mb-6 empty:hidden">
            <ActiveFilters query={query} path={path} />
          </div>

          {/* Boundary-д key өгөхгүй: шүүлтүүр солигдоход skeleton биш хуучин grid (бүдэг) хэвээр
             үлдэнэ. */}
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
    <p className="text-muted-foreground type-body h-6" aria-live="polite">
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
