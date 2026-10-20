import type { Metadata } from "next";
import { getCatalogFilters } from "@/features/catalog/api";
import { SearchView } from "@/features/search/search-view";

export const metadata: Metadata = {
  title: "Search by photo",
  description: "Upload, drop, paste or capture a photo of clothing and find visually similar products.",
  alternates: { canonical: "/search" },
  openGraph: { title: "Search by photo", url: "/search" },
};

// Хүсэлт бүрт render хийнэ: хуудас каталогийн API-г уншдаг бөгөөд build үед (CI, Docker) API
// байдаггүй. API client-ийн fetch cache (`revalidate`) эдгээрийг хямд байлгана.
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const options = await getCatalogFilters();
  return <SearchView options={options} />;
}
