import type { Metadata } from "next";
import { getCatalogFilters } from "@/features/catalog/api";
import { SearchView } from "@/features/search/search-view";

export const metadata: Metadata = {
  title: "Search by photo",
  description: "Upload, drop, paste or capture a photo of clothing and find visually similar products.",
  alternates: { canonical: "/search" },
  openGraph: { title: "Search by photo", url: "/search" },
};

// Rendered per request: the page reads the catalogue API, which isn't available at build time (CI, Docker).
// The API client's fetch cache (`revalidate`) still keeps these cheap.
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const options = await getCatalogFilters();
  return <SearchView options={options} />;
}
