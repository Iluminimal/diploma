import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type Order = components["schemas"]["OrderOut"];
export type OrderSummary = components["schemas"]["OrderSummary"];
export type OrderPage = components["schemas"]["OrderPage"];

export const fetchOrders = (page: number) =>
  call(browserApi().GET("/api/v1/orders", { params: { query: { page, page_size: 10 } } }));

export const fetchOrder = (number: string) =>
  call(browserApi().GET("/api/v1/orders/{number}", { params: { path: { number } } }));
