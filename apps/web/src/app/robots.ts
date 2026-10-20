import type { MetadataRoute } from "next";
import { robotsFor, sitemapIds } from "@/features/seo/sitemap";
import { countProducts } from "@/features/seo/sitemap-data";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // API унасан үед ч robots.txt ажилласаар байх ёстой: эхний sitemap-ыг жагсааж цааш явна.
  const total = await countProducts().catch(() => 0);
  return robotsFor(sitemapIds(total).map(({ id }) => id));
}
