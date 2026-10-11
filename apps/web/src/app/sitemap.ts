import type { MetadataRoute } from "next";
import { getCatalogNav } from "@/features/catalog/api";
import { countProducts, productsForSitemap } from "@/features/seo/sitemap-data";
import { categoryEntries, productEntries, sitemapIds, staticEntries } from "@/features/seo/sitemap";

// Read from the catalogue API on request (it is not reachable at build time); the API client
// caches the data for an hour, which is as fresh as a sitemap needs to be.
export const dynamic = "force-dynamic";

export async function generateSitemaps() {
  return sitemapIds(await countProducts());
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  const products = productEntries(await productsForSitemap(id));
  return id === 0 ? [...staticEntries(), ...categoryEntries(await getCatalogNav()), ...products] : products;
}
