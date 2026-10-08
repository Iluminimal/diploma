import type { ShippingMethodId, ShippingMethods } from "./checkout-api";

/**
 * What the shipping line will cost, for the live total on the page. The server decides the real
 * amount when the order is created; this mirrors its rule (standard is free over a threshold).
 */
export function shippingCostFor(methods: ShippingMethods, id: ShippingMethodId, subtotalCents: number): number {
  const method = methods.items.find((m) => m.id === id);
  if (!method) return 0;
  if (id === "standard" && subtotalCents >= methods.free_shipping_threshold_cents) return 0;
  return method.price_cents;
}
