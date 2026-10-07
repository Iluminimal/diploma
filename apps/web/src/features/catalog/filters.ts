import { z } from "zod";

/** Filter dimensions that accept several values (`?gender=Men&gender=Unisex`). */
export const MULTI_KEYS = [
  "gender",
  "master_category",
  "sub_category",
  "article_type",
  "color",
  "season",
  "usage",
] as const;
export type MultiKey = (typeof MULTI_KEYS)[number];

export const SORTS = ["newest", "price_asc", "price_desc", "relevance"] as const;
export type Sort = (typeof SORTS)[number];

export const MAX_VALUES_PER_KEY = 12;
const MAX_PRICE_CENTS = 10_000_000;

/** Filters shared by listing, similar and every search endpoint. Prices are integer cents. */
export type CatalogFilters = Record<MultiKey, string[]> & {
  min_price?: number;
  max_price?: number;
  in_stock: boolean;
};

export type ListingQuery = CatalogFilters & {
  q?: string;
  sort?: Sort;
  page: number;
};

export type RawParams = Record<string, string | string[] | undefined>;

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

export function emptyFilters(): CatalogFilters {
  return {
    gender: [],
    master_category: [],
    sub_category: [],
    article_type: [],
    color: [],
    season: [],
    usage: [],
    in_stock: false,
  };
}

/** Serialize to the shortest URL: defaults (page 1, no sort, empty lists) are omitted. */
export function toSearchParams(query: Partial<ListingQuery>): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of MULTI_KEYS) {
    for (const value of query[key] ?? []) out.append(key, value);
  }
  if (query.min_price !== undefined) out.set("min_price", String(query.min_price));
  if (query.max_price !== undefined) out.set("max_price", String(query.max_price));
  if (query.in_stock) out.set("in_stock", "true");
  if (query.q) out.set("q", query.q);
  if (query.sort) out.set("sort", query.sort);
  if (query.page && query.page > 1) out.set("page", String(query.page));
  return out;
}

export function toHref(path: string, query: Partial<ListingQuery>): string {
  const qs = toSearchParams(query).toString();
  return qs ? `${path}?${qs}` : path;
}

/** Number of active filters (not counting q, sort or page). */
export function activeFilterCount(f: CatalogFilters): number {
  return (
    MULTI_KEYS.reduce((n, k) => n + f[k].length, 0) +
    (f.min_price !== undefined || f.max_price !== undefined ? 1 : 0) +
    (f.in_stock ? 1 : 0)
  );
}

/** Toggle one value of a multi-value filter, returning a new object. */
export function toggleValue<T extends CatalogFilters>(filters: T, key: MultiKey, value: string): T {
  const current = filters[key];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value].slice(-MAX_VALUES_PER_KEY);
  return { ...filters, [key]: next };
}

/** Fields of `CatalogFilters` as the flat form/query structure the API takes. */
export function toApiFilters(f: CatalogFilters) {
  return {
    gender: f.gender,
    master_category: f.master_category,
    sub_category: f.sub_category,
    article_type: f.article_type,
    color: f.color,
    season: f.season,
    usage: f.usage,
    min_price: f.min_price,
    max_price: f.max_price,
    in_stock: f.in_stock || undefined,
  };
}
