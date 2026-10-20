import { z } from "zod";
import {
  MAX_PRICE_CENTS,
  MAX_VALUES_PER_KEY,
  SORTS,
  type ListingQuery,
  type RawParams,
} from "./filters";

// `filters.ts`-ээс тусгаарласан: тэр module-ийг browser код (search, filter chip) import хийдэг тул
// schema library-г хуудас бүрд татуулах ёсгүй. URL-ийг зөвхөн server-т render хийдэг жагсаалт parse
// хийнэ.

const multi = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .transform((v) => [...new Set(v.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_VALUES_PER_KEY))
  .catch([]);

const cents = z.coerce.number().int().min(0).max(MAX_PRICE_CENTS).optional().catch(undefined);

const schema = z.object({
  gender: multi.default([]),
  master_category: multi.default([]),
  sub_category: multi.default([]),
  article_type: multi.default([]),
  color: multi.default([]),
  season: multi.default([]),
  usage: multi.default([]),
  min_price: cents,
  max_price: cents,
  in_stock: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v[0] : v) === "true")
    .catch(false)
    .default(false),
  q: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 200) || undefined)
    .catch(undefined),
  sort: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v[0] : v))
    .pipe(z.enum(SORTS))
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

/**
 * Итгэмжгүй URL param-ыг хүчинтэй жагсаалтын query болгон parse хийнэ. Буруу зүйлийг хасна (хэзээ ч
 * throw хийхгүй), ингэснээр гараар зассан URL хуудсыг эвдэхгүй, API 422 үүсгэхгүй.
 */
export function parseListingQuery(params: RawParams): ListingQuery {
  const parsed = schema.parse(params);
  const query: ListingQuery = { ...parsed };
  // API текст query-гүй `relevance`-ийг, мөн урвуу үнийн мужийг татгалзана.
  if (!query.q && query.sort === "relevance") query.sort = undefined;
  if (
    query.min_price !== undefined &&
    query.max_price !== undefined &&
    query.min_price > query.max_price
  ) {
    [query.min_price, query.max_price] = [query.max_price, query.min_price];
  }
  return query;
}
