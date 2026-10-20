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
export const STATS_PERIODS = [7, 30, 90] as const;
export const DEFAULT_PERIOD = 30;
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

export const fetchAdminStats = (days: number) =>
  call(browserApi().GET("/api/v1/admin/stats", { params: { query: { days } } }));

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
