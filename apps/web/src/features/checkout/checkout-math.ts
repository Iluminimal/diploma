import type { ShippingMethodId, ShippingMethods } from "./checkout-api";

/**
 * Хуудасны шууд нийт дүнд зориулж хүргэлт хэд болохыг бодно. Жинхэнэ дүнг захиалга үүсгэхэд сервер
 * шийднэ; энэ нь түүний дүрмийг давтана (standard нь босгоос дээш үнэгүй).
 */
export function shippingCostFor(methods: ShippingMethods, id: ShippingMethodId, subtotalCents: number): number {
  const method = methods.items.find((m) => m.id === id);
  if (!method) return 0;
  if (id === "standard" && subtotalCents >= methods.free_shipping_threshold_cents) return 0;
  return method.price_cents;
}
