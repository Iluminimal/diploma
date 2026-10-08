import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:8000"),
  // Canonical URLs, Open Graph, JSON-LD and the sitemap are built from this, so a wrong value
  // would put the wrong address in front of search engines: refuse to start instead.
  NEXT_PUBLIC_SITE_URL: z
    .url()
    .default("http://localhost:3000")
    .transform((url) => url.replace(/\/+$/, "")),
});

// Next.js only inlines NEXT_PUBLIC_* variables referenced statically, so each
// one must be listed here explicitly rather than passing `process.env` whole.
export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || undefined,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
});
