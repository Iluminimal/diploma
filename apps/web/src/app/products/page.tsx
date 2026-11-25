import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCatalogFilters } from "@/features/catalog/api";
import { toHref } from "@/features/catalog/filters";
import { CategoryChips } from "@/features/catalog/category-chips";
import { DEPARTMENT_LINKS, categoryHref } from "@/features/catalog/nav";
import { ListingView } from "@/features/catalog/listing-view";
import { listingTitle } from "@/features/catalog/listing-title";
import { parseListingQuery } from "@/features/catalog/parse-listing-query";
import { getVocab } from "@/i18n/server";

export async function generateMetadata({ searchParams }: PageProps<"/products">): Promise<Metadata> {
  const query = parseListingQuery(await searchParams);
  const [t, vocab] = await Promise.all([getTranslations("catalog"), getVocab()]);
  const title = listingTitle(query, t, vocab);
  const canonical = toHref("/products", { ...query, sort: undefined });
  return {
    title,
    description: t("listingDescription", { title: title.toLowerCase() }),
    alternates: { canonical },
    openGraph: { title, url: canonical },
    // Чөлөөт текстийн хайлт болон гүн хуудсууд хайлтын индексэд ямар ч үнэ цэнэ нэмэхгүй.
    robots: query.q || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const query = parseListingQuery(await searchParams);
  const [options, t, vocab] = await Promise.all([getCatalogFilters(), getTranslations("catalog"), getVocab()]);
  return (
    <ListingView
      title={listingTitle(query, t, vocab)}
      path="/products"
      query={query}
      options={options}
      chips={
        <CategoryChips
          label={t("departments")}
          items={DEPARTMENT_LINKS.map((d) => ({ label: vocab.department(d.label), href: categoryHref(d.slug) }))}
        />
      }
    />
  );
}
