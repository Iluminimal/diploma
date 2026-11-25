"use client";

import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { fetchShippingMethods } from "@/features/checkout/checkout-api";
import { useShippingText } from "@/features/checkout/shipping-text";
import { useFormat } from "@/i18n/use-format";
import { queryKeys } from "@/lib/query-keys";

/**
 * Үнийн доорх нэг мөр: "Энгийн хүргэлт · 2-3 хоног, 50,000₮-өөс дээш үнэгүй". `DeliveryInfo`-тай ижил
 * endpoint (cache хуваалцдаг); ачаалагдтал эсвэл унавал юу ч харуулахгүй.
 */
export function DeliveryEstimate() {
  const t = useTranslations("catalog.delivery");
  const shipping = useShippingText();
  const format = useFormat();
  const { data } = useQuery({
    queryKey: queryKeys.shippingMethods(),
    queryFn: () => fetchShippingMethods(),
    staleTime: 600_000,
  });
  const standard = data?.items.find((method) => method.id === "standard") ?? data?.items[0];
  if (!data || !standard) return null;
  const free = data.free_shipping_threshold_cents;
  return (
    <p className="text-muted-foreground type-caption flex items-center gap-2">
      <Truck aria-hidden className="size-4 shrink-0" />
      <span>
        {shipping.label(standard)} · {shipping.days(standard)}
        {standard.id === "standard" && free > 0 && t("freeOver", { price: format.price(free, data.currency) })}
      </span>
    </p>
  );
}
