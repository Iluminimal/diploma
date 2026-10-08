import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductGrid, ProductGridSkeleton } from "@/components/product-grid";
import { getCatalogFilters, listProducts } from "@/features/catalog/api";
import { ActiveFilters } from "@/features/catalog/active-filters";
import { toHref, type ListingQuery } from "@/features/catalog/filters";
import { parseListingQuery } from "@/features/catalog/parse-listing-query";
import { FilterSidebar, MobileFilters, SortSelect } from "@/features/catalog/listing-controls";
import { listingTitle } from "@/features/catalog/listing-title";
import { Pagination } from "@/features/catalog/pagination";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Camera, SearchX } from "lucide-react";

export async function generateMetadata({ searchParams }: PageProps<"/products">): Promise<Metadata> {
  const query = parseListingQuery(await searchParams);
  const title = listingTitle(query);
  const canonical = toHref("/products", { ...query, sort: undefined });
  return {
    title,
    description: `Shop ${title.toLowerCase()} at Lookalike. Filter by colour, price and category.`,
    alternates: { canonical },
    openGraph: { title, url: canonical },
    // Free-text search and deep pages add no value to a search index.
    robots: query.q || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const query = parseListingQuery(await searchParams);
  const options = await getCatalogFilters();
  const title = listingTitle(query);

  return (
    <div className="container-page py-8 md:py-12">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <Suspense fallback={<div className="bg-muted h-5 w-24 animate-pulse rounded" />}>
          <ResultCount query={query} />
        </Suspense>
      </div>

      <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-3">
            <FilterSidebar options={options} query={query} />
          </div>
        </aside>

        <section aria-label="Products" className="min-w-0">
          <div className="mb-5 flex items-center justify-between gap-3">
            <MobileFilters options={options} query={query} />
            <div className="ml-auto">
              <SortSelect query={query} />
            </div>
          </div>
          <div className="mb-6 empty:hidden">
            <ActiveFilters query={query} />
          </div>

          <Suspense key={JSON.stringify(query)} fallback={<ProductGridSkeleton count={12} />}>
            <Results query={query} />
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

async function Results({ query }: { query: ListingQuery }) {
  const page = await listProducts(query);
  if (page.items.length === 0) return <EmptyState query={query} />;
  return (
    <>
      <ProductGrid products={page.items} columns={3} priorityCount={3} />
      <Pagination query={query} pages={page.pages} />
    </>
  );
}

function EmptyState({ query }: { query: ListingQuery }) {
  return (
    <div className="border-border flex flex-col items-center gap-4 rounded-3xl border border-dashed px-6 py-20 text-center">
      <SearchX className="text-muted-foreground size-8" />
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Nothing matches {query.q ? `“${query.q}”` : "these filters"}</h2>
        <p className="text-muted-foreground text-sm">
          Try removing a filter, or search with a photo instead.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="lg">
          <Link href="/products">Clear filters</Link>
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
