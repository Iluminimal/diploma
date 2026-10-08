import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type ShippingMethods = components["schemas"]["ShippingMethodList"];
export type ShippingMethodId = components["schemas"]["ShippingMethodOut"]["id"];
export type CheckoutResult = components["schemas"]["CheckoutOut"];

export const fetchShippingMethods = () => call(browserApi().GET("/api/v1/checkout/shipping-methods"));

/** Reserves the cart's stock and creates the order. The same key always returns the same order. */
export const createCheckout = (body: { address_id: number; shipping_method: ShippingMethodId }, key: string) =>
  call(browserApi().POST("/api/v1/checkout", { body, params: { header: { "idempotency-key": key } } }));

/** Demo payment: marks the order paid through the API's offline gateway. No card data is sent. */
export const payDemoOrder = (number: string) =>
  call(
    browserApi().POST("/api/v1/checkout/orders/{number}/simulate-payment", {
      params: { path: { number } },
    }),
  );
