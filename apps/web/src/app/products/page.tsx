import type { Metadata } from "next";
import { getCatalogFilters } from "@/features/catalog/api";
import { toHref } from "@/features/catalog/filters";
import { CategoryChips } from "@/features/catalog/category-chips";
import { DEPARTMENT_LINKS, categoryHref } from "@/features/catalog/nav";
import { ListingView } from "@/features/catalog/listing-view";
import { listingTitle } from "@/features/catalog/listing-title";
import { parseListingQuery } from "@/features/catalog/parse-listing-query";

export async function generateMetadata({ searchParams }: PageProps<"/products">): Promise<Metadata> {
  const query = parseListingQuery(await searchParams);
  const title = listingTitle(query);
  const canonical = toHref("/products", { ...query, sort: undefined });
  return {
    title,
    description: `Shop ${title.toLowerCase()} at Angel. Filter by colour, price and category.`,
    alternates: { canonical },
    openGraph: { title, url: canonical },
    // Чөлөөт текстийн хайлт болон гүн хуудсууд хайлтын индексэд ямар ч үнэ цэнэ нэмэхгүй.
    robots: query.q || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const query = parseListingQuery(await searchParams);
  const options = await getCatalogFilters();
  return (
    <ListingView
      title={listingTitle(query)}
      path="/products"
      query={query}
      options={options}
      chips={
        <CategoryChips
          label="Departments"
          items={DEPARTMENT_LINKS.map((d) => ({ label: d.label, href: categoryHref(d.slug) }))}
        />
      }
    />
  );
}
