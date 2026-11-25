import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCatalogFilters } from "@/features/catalog/api";
import { SearchView } from "@/features/search/search-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search.meta");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/search" },
    openGraph: { title: t("title"), url: "/search" },
  };
}

// Хүсэлт бүрт render хийнэ: хуудас каталогийн API-г уншдаг бөгөөд build үед (CI, Docker) API
// байдаггүй. API client-ийн fetch cache (`revalidate`) эдгээрийг хямд байлгана.
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const options = await getCatalogFilters();
  return <SearchView options={options} />;
}
