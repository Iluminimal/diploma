/** Олон утга авдаг шүүлтүүрийн хэмжигдэхүүнүүд (`?gender=Men&gender=Unisex`). */
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
export const MAX_PRICE_CENTS = 10_000_000;

/** Жагсаалт, төстэй бүтээгдэхүүн, бүх хайлтын endpoint-ын хуваалцдаг шүүлтүүр. Үнэ бүхэл cent. */
export type CatalogFilters = Record<MultiKey, string[]> & {
  min_price?: number;
  max_price?: number;
  in_stock: boolean;
};

export type ListingQuery = CatalogFilters & {
  q?: string;
  /** /c/... хуудас URL зам-аас тохируулна (query string-д хэзээ ч serialize хийхгүй). */
  department?: string;
  category?: string;
  sort?: Sort;
  page: number;
};

export type RawParams = Record<string, string | string[] | undefined>;

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

/**
 * Хамгийн богино URL болгон serialize хийнэ: default утгууд (1-р хуудас, эрэмбэгүй, хоосон
 * жагсаалт) орхигдоно.
 */
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

/** Идэвхтэй шүүлтүүрийн тоо (q, sort, page-ийг тооцохгүй). */
export function activeFilterCount(f: CatalogFilters): number {
  return (
    MULTI_KEYS.reduce((n, k) => n + f[k].length, 0) +
    (f.min_price !== undefined || f.max_price !== undefined ? 1 : 0) +
    (f.in_stock ? 1 : 0)
  );
}

/** Олон утгатай шүүлтүүрийн нэг утгыг асаах/унтраана, шинэ объект буцаана. */
export function toggleValue<T extends CatalogFilters>(filters: T, key: MultiKey, value: string): T {
  const current = filters[key];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value].slice(-MAX_VALUES_PER_KEY);
  return { ...filters, [key]: next };
}

/** `CatalogFilters`-ийн талбарууд API-ийн авдаг хавтгай form/query бүтэцтэй. */
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
