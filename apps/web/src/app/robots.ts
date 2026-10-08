import type { MetadataRoute } from "next";
import { robotsFor, sitemapIds } from "@/features/seo/sitemap";
import { countProducts } from "@/features/seo/sitemap-data";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // robots.txt must keep working when the API is down: list the first sitemap and move on.
  const total = await countProducts().catch(() => 0);
  return robotsFor(sitemapIds(total).map(({ id }) => id));
}
