import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type ShippingMethods = components["schemas"]["ShippingMethodList"];
export type ShippingMethodId = components["schemas"]["ShippingMethodOut"]["id"];
export type CheckoutResult = components["schemas"]["CheckoutOut"];

export const fetchShippingMethods = () => call(browserApi().GET("/api/v1/checkout/shipping-methods"));

/** Cart-ийн нөөцийг нөөцөлж, захиалга үүсгэнэ. Ижил key үргэлж ижил захиалгыг буцаана. */
export const createCheckout = (body: { address_id: number; shipping_method: ShippingMethodId; contact_email?: string }, key: string) =>
  call(browserApi().POST("/api/v1/checkout", { body, params: { header: { "idempotency-key": key } } }));

/**
 * Demo төлбөр: API-ийн offline gateway-р захиалгыг төлөгдсөн гэж тэмдэглэнэ. Картын өгөгдөл
 * илгээхгүй.
 */
export const payDemoOrder = (number: string) =>
  call(
    browserApi().POST("/api/v1/checkout/orders/{number}/simulate-payment", {
      params: { path: { number } },
    }),
  );
