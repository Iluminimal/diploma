import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type ShippingMethods = components["schemas"]["ShippingMethodList"];
export type ShippingMethodId = components["schemas"]["ShippingMethodOut"]["id"];
export type ShippingZone = "ub" | "rural";
export type Charge = components["schemas"]["ChargeOut"];
export type QPayCheckout = components["schemas"]["QPayCheckoutOut"];

/** Хүргэлтийн төрөл, үнэ: Улаанбаатар (`ub`) эсвэл орон нутаг (`rural`). */
export const fetchShippingMethods = (zone: ShippingZone = "ub") =>
  call(browserApi().GET("/api/v1/checkout/shipping-methods", { params: { query: { zone } } }));

/** Checkout ямар аргаар төлүүлэх вэ (QPay эсвэл demo), захиалга үүсэхээс өмнө. */
export const fetchPaymentMethod = () => call(browserApi().GET("/api/v1/checkout/payment-method"));

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

/**
 * QPay: худалдан авагч "Төлбөрөө шалгах" дарсан эсвэл хуудас руу буцаж ирсэн. API нь QPay-ээс
 * асууж, төлөгдсөн бол захиалгыг шийднэ. Захиалгыг буцаана.
 */
export const checkPayment = (number: string) =>
  call(
    browserApi().POST("/api/v1/checkout/orders/{number}/check-payment", {
      params: { path: { number } },
    }),
  );
