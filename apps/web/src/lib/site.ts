import { env } from "@/lib/env";

/** Public origin used for canonical URLs, Open Graph, JSON-LD and the sitemap (no trailing slash). */
export const SITE_URL = env.NEXT_PUBLIC_SITE_URL;

export const SITE_NAME = "Lookalike";

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
