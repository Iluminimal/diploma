import type { MetadataRoute } from "next";
import { categoryPaths, type CatalogNav } from "@/features/catalog/nav";
import { productPath } from "@/features/catalog/product";
import { absoluteUrl } from "@/lib/site";

/** Products per sitemap file. The protocol allows 50,000 URLs; smaller files are quicker to build. */
export const SITEMAP_CHUNK = 10_000;

/** Ids of the sitemap files for a catalogue of `total` products (always at least one). */
export function sitemapIds(total: number): { id: number }[] {
  const files = Math.max(1, Math.ceil(total / SITEMAP_CHUNK));
  return Array.from({ length: files }, (_, id) => ({ id }));
}

/** Pages that are not products or categories: the home page, the listing and the search tool. */
export function staticEntries(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/products"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/search"), changeFrequency: "monthly", priority: 0.5 },
  ];
}

/** Every department and category page (/c/men, /c/men/apparel/topwear, ...). Shallower pages rank higher. */
export function categoryEntries(nav: CatalogNav): MetadataRoute.Sitemap {
  return categoryPaths(nav).map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: "daily",
    priority: Math.max(0.4, 0.8 - 0.1 * (path.split("/").length - 3)),
  }));
}

export function productEntries(items: { id: number; slug: string; updated_at: string }[]): MetadataRoute.Sitemap {
  return items.map((item) => ({
    url: absoluteUrl(productPath(item)),
    lastModified: new Date(item.updated_at),
    changeFrequency: "weekly",
    priority: 0.6,
  }));
}

/** Where each sitemap file lives (`/sitemap/<id>.xml`). */
export const sitemapUrl = (id: number) => absoluteUrl(`/sitemap/${id}.xml`);

/**
 * Crawl rules. Account, cart, checkout and admin pages are private; free-text search and deep
 * pages are `noindex` and not worth a crawler's time (products are listed in the sitemap).
 */
export function robotsFor(ids: number[]): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/admin",
        "/cart",
        "/checkout",
        "/login",
        "/register",
        "/api/",
        "/*?*q=",
        "/*?*page=",
      ],
    },
    sitemap: ids.map(sitemapUrl),
  };
}
