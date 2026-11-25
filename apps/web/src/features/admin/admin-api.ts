import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type AdminProduct = components["schemas"]["AdminProductOut"];
export type AdminProductPage = components["schemas"]["AdminProductPage"];
export type AdminCategory = components["schemas"]["AdminCategory"];
export type AdminProductChanges = components["schemas"]["AdminProductUpdate"];
export type AdminOrderPage = components["schemas"]["AdminOrderPage"];
export type AdminOrderSummary = components["schemas"]["AdminOrderSummary"];
export type AdminOrder = components["schemas"]["AdminOrderOut"];
export type AdminStats = components["schemas"]["AdminStats"];
export type FulfillmentBoard = components["schemas"]["FulfillmentBoard"];
export type QueuedOrder = components["schemas"]["QueuedOrder"];
export type AuditEntry = components["schemas"]["AuditEntry"];
export type AuditPage = components["schemas"]["AuditPage"];
export type AdminCustomerPage = components["schemas"]["AdminCustomerPage"];
export type AdminCustomer = components["schemas"]["AdminCustomer"];
export type AdminCustomerDetail = components["schemas"]["AdminCustomerDetail"];
export type AdminReviewPage = components["schemas"]["AdminReviewPage"];
export type AdminReview = components["schemas"]["AdminReviewOut"];
export type ShipDetails = components["schemas"]["ShipRequest"];
export type RefundDetails = components["schemas"]["RefundRequest"];

export const PRODUCT_STATUSES = ["all", "active", "inactive"] as const;
export const PRODUCT_SORTS = ["newest", "price_asc", "price_desc", "stock_asc"] as const;
export const STOCK_FILTERS = ["all", "low", "out"] as const;
export const ORDER_STATUSES = ["all", "pending", "paid", "shipped", "delivered", "cancelled", "refunded"] as const;
export const CUSTOMER_STATUSES = ["all", "active", "inactive"] as const;
export const CUSTOMER_SORTS = ["newest", "spent", "orders", "name"] as const;
export const REVIEW_STATUSES = ["all", "published", "hidden"] as const;
export const STATS_PERIODS = [7, 30, 90, 365] as const;
export const DEFAULT_PERIOD = 30;
export const AUDIT_ENTITY_TYPES = ["all", "product", "order"] as const;

/** Dashboard-ын хугацаа: сүүлийн `days` өдөр, эсвэл `start`..`end` (хоёулаа тооцогдоно) тусгай хугацаа. */
export type StatsPeriod = { days: number; start?: string; end?: string };

export type AuditListParams = {
  entity: (typeof AUDIT_ENTITY_TYPES)[number];
  actor: number;
  action: string;
  page: number;
};
export const PAGE_SIZE = 25;

export type ProductListParams = {
  q: string;
  status: (typeof PRODUCT_STATUSES)[number];
  stock: (typeof STOCK_FILTERS)[number];
  sort: (typeof PRODUCT_SORTS)[number];
  page: number;
};

export type CustomerListParams = {
  q: string;
  status: (typeof CUSTOMER_STATUSES)[number];
  sort: (typeof CUSTOMER_SORTS)[number];
  page: number;
};

export type ReviewListParams = {
  q: string;
  status: (typeof REVIEW_STATUSES)[number];
  /** 0 бол од хязгаарлахгүй гэсэн үг. */
  rating: number;
  page: number;
};

export type OrderListParams = {
  q: string;
  status: (typeof ORDER_STATUSES)[number];
  page: number;
};

export const fetchAdminProducts = (params: ProductListParams) =>
  call(
    browserApi().GET("/api/v1/admin/products", {
      params: {
        query: {
          q: params.q || undefined,
          status: params.status,
          stock: params.stock,
          sort: params.sort,
          page: params.page,
          page_size: PAGE_SIZE,
        },
      },
    }),
  );

export const fetchAdminProduct = (id: number) =>
  call(browserApi().GET("/api/v1/admin/products/{product_id}", { params: { path: { product_id: id } } }));

export const fetchAdminCategories = () => call(browserApi().GET("/api/v1/admin/categories"));

/**
 * Upload endpoint-ууд multipart form авдаг; boundary-г browser өөрөө тохируулдаг тул content type
 * энд заахгүй.
 */
const multipart = (form: FormData) => ({
  body: form as unknown as never,
  bodySerializer: (body: unknown) => body as FormData,
});

export const createAdminProduct = (form: FormData) =>
  call(browserApi().POST("/api/v1/admin/products", multipart(form)));

export const updateAdminProduct = (id: number, body: AdminProductChanges) =>
  call(browserApi().PATCH("/api/v1/admin/products/{product_id}", { params: { path: { product_id: id } }, body }));

export const replaceAdminProductImage = (id: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return call(
    browserApi().PUT("/api/v1/admin/products/{product_id}/image", {
      params: { path: { product_id: id } },
      ...multipart(form),
    }),
  );
};

export const setAdminProductActive = (id: number, active: boolean) =>
  call(
    browserApi().POST(
      active ? "/api/v1/admin/products/{product_id}/activate" : "/api/v1/admin/products/{product_id}/deactivate",
      { params: { path: { product_id: id } } },
    ),
  );

export const fetchAdminOrders = (params: OrderListParams) =>
  call(
    browserApi().GET("/api/v1/admin/orders", {
      params: { query: { q: params.q || undefined, status: params.status, page: params.page, page_size: PAGE_SIZE } },
    }),
  );

export const fetchAdminOrder = (number: string) =>
  call(browserApi().GET("/api/v1/admin/orders/{number}", { params: { path: { number } } }));

const orderPath = (number: string) => ({ params: { path: { number } } });

export const shipAdminOrder = (number: string, body: ShipDetails) =>
  call(browserApi().POST("/api/v1/admin/orders/{number}/ship", { ...orderPath(number), body }));

export const deliverAdminOrder = (number: string) =>
  call(browserApi().POST("/api/v1/admin/orders/{number}/deliver", orderPath(number)));

export const cancelAdminOrder = (number: string, reason: string) =>
  call(
    browserApi().POST("/api/v1/admin/orders/{number}/cancel", {
      ...orderPath(number),
      body: reason ? { reason } : undefined,
    }),
  );

export const refundAdminOrder = (number: string, body: RefundDetails) =>
  call(browserApi().POST("/api/v1/admin/orders/{number}/refund", { ...orderPath(number), body }));

export const addAdminOrderNote = (number: string, text: string) =>
  call(browserApi().POST("/api/v1/admin/orders/{number}/notes", { ...orderPath(number), body: { text } }));

/** Хугацааны query: тусгай хугацаа бол start/end, үгүй бол сүүлийн `days` өдөр. */
const periodQuery = (period: StatsPeriod) =>
  period.start && period.end ? { start: period.start, end: period.end } : { days: period.days };

export const fetchAdminStats = (period: StatsPeriod) =>
  call(browserApi().GET("/api/v1/admin/stats", { params: { query: periodQuery(period) } }));

export const fetchFulfillmentBoard = () => call(browserApi().GET("/api/v1/admin/fulfillment"));

export const fetchAdminAudit = (params: AuditListParams) =>
  call(
    browserApi().GET("/api/v1/admin/audit", {
      params: {
        query: {
          entity_type: params.entity === "all" ? undefined : params.entity,
          actor_id: params.actor || undefined,
          action: params.action || undefined,
          page: params.page,
          page_size: PAGE_SIZE,
        },
      },
    }),
  );

/** CSV-г token-тойгоор татаж (энгийн холбоос Authorization header илгээхгүй) browser-т хадгалуулна. */
async function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadStatsCsv(period: StatsPeriod) {
  const blob = await call(
    browserApi().GET("/api/v1/admin/export/stats", {
      params: { query: periodQuery(period) },
      parseAs: "blob",
    }),
  );
  await saveBlob(blob as Blob, `angel-stats-${period.start ?? `last-${period.days}-days`}.csv`);
}

export async function downloadOrdersCsv(params: OrderListParams) {
  const blob = await call(
    browserApi().GET("/api/v1/admin/export/orders", {
      params: { query: { q: params.q || undefined, status: params.status } },
      parseAs: "blob",
    }),
  );
  await saveBlob(blob as Blob, "angel-orders.csv");
}

export const setAdminProductStock = (id: number, quantity: number) =>
  call(
    browserApi().PUT("/api/v1/admin/products/{product_id}/stock", {
      params: { path: { product_id: id } },
      body: { quantity },
    }),
  );

export const fetchAdminCustomers = (params: CustomerListParams) =>
  call(
    browserApi().GET("/api/v1/admin/customers", {
      params: {
        query: { q: params.q || undefined, status: params.status, sort: params.sort, page: params.page, page_size: PAGE_SIZE },
      },
    }),
  );

export const fetchAdminCustomer = (id: number) =>
  call(browserApi().GET("/api/v1/admin/customers/{user_id}", { params: { path: { user_id: id } } }));

export const setAdminCustomerActive = (id: number, active: boolean) =>
  call(
    browserApi().POST(
      active ? "/api/v1/admin/customers/{user_id}/activate" : "/api/v1/admin/customers/{user_id}/deactivate",
      { params: { path: { user_id: id } } },
    ),
  );

export const fetchAdminReviews = (params: ReviewListParams) =>
  call(
    browserApi().GET("/api/v1/admin/reviews", {
      params: {
        query: {
          q: params.q || undefined,
          status: params.status,
          rating: params.rating || undefined,
          page: params.page,
          page_size: PAGE_SIZE,
        },
      },
    }),
  );

export const setAdminReviewPublished = (id: number, published: boolean) =>
  call(
    browserApi().POST(
      published ? "/api/v1/admin/reviews/{review_id}/publish" : "/api/v1/admin/reviews/{review_id}/hide",
      { params: { path: { review_id: id } } },
    ),
  );
