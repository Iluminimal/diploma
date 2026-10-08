import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type AdminProduct = components["schemas"]["AdminProductOut"];
export type AdminProductPage = components["schemas"]["AdminProductPage"];
export type AdminCategory = components["schemas"]["AdminCategory"];
export type AdminProductChanges = components["schemas"]["AdminProductUpdate"];
export type AdminOrderPage = components["schemas"]["AdminOrderPage"];
export type AdminOrderSummary = components["schemas"]["AdminOrderSummary"];
export type AdminOrder = components["schemas"]["AdminOrderOut"];

export const PRODUCT_STATUSES = ["all", "active", "inactive"] as const;
export const PRODUCT_SORTS = ["newest", "price_asc", "price_desc", "stock_asc"] as const;
export const ORDER_STATUSES = ["all", "pending", "paid", "cancelled"] as const;
export const PAGE_SIZE = 25;

export type ProductListParams = {
  q: string;
  status: (typeof PRODUCT_STATUSES)[number];
  sort: (typeof PRODUCT_SORTS)[number];
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

/** The upload endpoints take multipart forms; the browser sets the boundary, so no content type here. */
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
