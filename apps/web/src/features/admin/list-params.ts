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
  AUDIT_ENTITY_TYPES,
  type AuditListParams,
  type StatsPeriod,
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

/** Жагсаалтын state URL-д байдаг тул шүүсэн харагдацыг bookmark хийж, дахин ачаалахад хадгална. */
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

/** Нөөцийн жагсаалт нь зарагдаж буй бүтээгдэхүүнийг дуусах дарааллаар нь эрэмбэлсэн жагсаалт. */
export function parseInventoryParams(raw: Raw): ProductListParams {
  return {
    q: text(first(raw.q)),
    status: "active",
    stock: oneOf(STOCK_FILTERS, first(raw.stock), "all"),
    sort: "stock_asc",
    page: pageNumber(first(raw.page)),
  };
}

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` бодит огноо бол UTC-ийн өдрийн эхний millisecond, үгүй бол undefined. */
function dayStart(value: string | undefined): number | undefined {
  if (!value || !ISO_DAY.test(value)) return undefined;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? undefined : time;
}

/**
 * Dashboard-ын хугацаа. `?start=&end=` хүчинтэй тусгай хугацаа (эхлэл ≤ төгсгөл, ирээдүй биш, 366
 * хоногоос ихгүй) бол түүнийг, үгүй бол `?days=` (7/30/90/365), гэнэтийн утгад default-ыг өгнө.
 */
export function parsePeriod(raw: Raw, now: Date = new Date()): StatsPeriod {
  const start = first(raw.start);
  const end = first(raw.end);
  const from = dayStart(start);
  const to = dayStart(end);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (from !== undefined && to !== undefined && from <= to && to <= today) {
    const days = Math.round((to - from) / DAY_MS) + 1;
    if (days <= 366) return { days, start, end };
  }
  const days = Number(first(raw.days));
  return { days: STATS_PERIODS.find((period) => period === days) ?? DEFAULT_PERIOD };
}

export function parseAuditParams(raw: Raw): AuditListParams {
  const actor = Number(first(raw.actor));
  const action = (first(raw.action) ?? "").trim();
  return {
    entity: oneOf(AUDIT_ENTITY_TYPES, first(raw.entity), "all"),
    actor: Number.isInteger(actor) && actor >= 1 ? actor : 0,
    action: /^[a-z]+\.[a-z]+$/.test(action) ? action : "",
    page: pageNumber(first(raw.page)),
  };
}

/** Жагсаалтын query string; URL богино байлгахын тулд default утгыг орхино. */
export function toQuery(params: Record<string, string | number>, defaults: Record<string, string | number>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== defaults[key]) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}
