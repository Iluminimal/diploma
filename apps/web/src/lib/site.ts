import { env } from "@/lib/env";

/** Canonical URL, Open Graph, JSON-LD, sitemap-д ашиглах нийтийн origin (төгсгөлд слэшгүй). */
export const SITE_URL = env.NEXT_PUBLIC_SITE_URL;

export const SITE_NAME = "Angel";

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
