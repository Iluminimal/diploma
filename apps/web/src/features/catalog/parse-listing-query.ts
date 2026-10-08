import { z } from "zod";
import {
  MAX_PRICE_CENTS,
  MAX_VALUES_PER_KEY,
  SORTS,
  type ListingQuery,
  type RawParams,
} from "./filters";

// Kept apart from `filters.ts`: that module is imported by browser code (search, filter chips) and
// must not drag a schema library into every page. Only the server-rendered listing parses URLs.

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
 * Parse untrusted URL params into a valid listing query. Anything malformed is dropped
 * (never throws), so a hand-edited URL can't break the page or cause an API 422.
 */
export function parseListingQuery(params: RawParams): ListingQuery {
  const parsed = schema.parse(params);
  const query: ListingQuery = { ...parsed };
  // The API rejects `relevance` without a text query, and a reversed price range.
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
