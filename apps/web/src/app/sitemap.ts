import type { MetadataRoute } from "next";
import { getCatalogNav } from "@/features/catalog/api";
import { countProducts, productsForSitemap } from "@/features/seo/sitemap-data";
import { categoryEntries, productEntries, sitemapIds, staticEntries } from "@/features/seo/sitemap";

// Хүсэлт ирэхэд каталогийн API-аас уншина (build үед хүрэх боломжгүй); API client өгөгдлийг нэг цаг
// cache-лэдэг, sitemap-д энэ хангалттай шинэ.
export const dynamic = "force-dynamic";

export async function generateSitemaps() {
  return sitemapIds(await countProducts());
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  const products = productEntries(await productsForSitemap(id));
  return id === 0 ? [...staticEntries(), ...categoryEntries(await getCatalogNav()), ...products] : products;
}
