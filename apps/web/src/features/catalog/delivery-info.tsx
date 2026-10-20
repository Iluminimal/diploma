"use client";

import { useQuery } from "@tanstack/react-query";
import { Price } from "@/components/product/price";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchShippingMethods } from "@/features/checkout/checkout-api";
import { queryKeys } from "@/lib/query-keys";

/** Хүргэлт хэд, хэр удах вэ: checkout-ын ашигладаг endpoint-оос уншина. */
export function DeliveryInfo() {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.shippingMethods,
    queryFn: fetchShippingMethods,
    staleTime: 600_000,
  });
  if (isPending) return <Skeleton aria-hidden className="h-16 rounded-lg" />;
  if (isError) return <p className="text-muted-foreground">Delivery options are shown at checkout.</p>;
  const free = data.free_shipping_threshold_cents;
  return (
    <ul className="space-y-2">
      {data.items.map((method) => (
        <li key={method.id} className="flex items-baseline justify-between gap-4">
          <span>
            <span className="font-medium">{method.label}</span>
            <span className="text-muted-foreground"> · {method.estimated_days}</span>
          </span>
          <span className="tabular-nums">
            {method.id === "standard" && free > 0 ? (
              <>
                <Price cents={method.price_cents} currency={data.currency} />
                <span className="text-muted-foreground">
                  , free over <Price cents={free} currency={data.currency} />
                </span>
              </>
            ) : (
              <Price cents={method.price_cents} currency={data.currency} />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
