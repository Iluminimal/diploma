import {
  CUSTOMER_SORTS,
  CUSTOMER_STATUSES,
  DEFAULT_PERIOD,
  ORDER_STATUSES,
  PRODUCT_SORTS,
  PRODUCT_STATUSES,
  REVIEW_STATUSES,
  STATS_PERIODS,
  STOCK_FILTERS,
  type CustomerListParams,
  type OrderListParams,
  type ProductListParams,
  type ReviewListParams,
} from "./admin-api";

type Raw = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function pageNumber(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

const text = (value: string | undefined) => (value ?? "").trim().slice(0, 200);

/** The list state lives in the URL, so a filtered view can be bookmarked and survives a reload. */
export function parseProductParams(raw: Raw): ProductListParams {
  return {
    q: text(first(raw.q)),
    status: oneOf(PRODUCT_STATUSES, first(raw.status), "all"),
    stock: oneOf(STOCK_FILTERS, first(raw.stock), "all"),
    sort: oneOf(PRODUCT_SORTS, first(raw.sort), "newest"),
    page: pageNumber(first(raw.page)),
  };
}

export function parseOrderParams(raw: Raw): OrderListParams {
  return {
    q: text(first(raw.q)),
    status: oneOf(ORDER_STATUSES, first(raw.status), "all"),
    page: pageNumber(first(raw.page)),
  };
}

export function parseCustomerParams(raw: Raw): CustomerListParams {
  return {
    q: text(first(raw.q)),
    status: oneOf(CUSTOMER_STATUSES, first(raw.status), "all"),
    sort: oneOf(CUSTOMER_SORTS, first(raw.sort), "newest"),
    page: pageNumber(first(raw.page)),
  };
}

export function parseReviewParams(raw: Raw): ReviewListParams {
  const rating = Number(first(raw.rating));
  return {
    q: text(first(raw.q)),
    status: oneOf(REVIEW_STATUSES, first(raw.status), "all"),
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 0,
    page: pageNumber(first(raw.page)),
  };
}

/** The inventory is the product list, kept to what is on sale and sorted by what is running out. */
export function parseInventoryParams(raw: Raw): ProductListParams {
  return {
    q: text(first(raw.q)),
    status: "active",
    stock: oneOf(STOCK_FILTERS, first(raw.stock), "all"),
    sort: "stock_asc",
    page: pageNumber(first(raw.page)),
  };
}

/** The dashboard's period in days; anything unexpected falls back to the default. */
export function parsePeriod(raw: Raw): number {
  const days = Number(first(raw.days));
  return STATS_PERIODS.find((period) => period === days) ?? DEFAULT_PERIOD;
}

/** Query string for a list view; defaults are left out to keep URLs short. */
export function toQuery(params: Record<string, string | number>, defaults: Record<string, string | number>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== defaults[key]) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}
