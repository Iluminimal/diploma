"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock, Truck, Zap } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Price } from "@/components/product/price";
import { fetchShippingMethods } from "@/features/checkout/checkout-api";
import { queryKeys } from "@/lib/query-keys";

function Service({ icon: Icon, title, index, children }: { icon: typeof Truck; title: string; index: number; children: ReactNode }) {
  return (
    <li className="view-rise flex flex-col items-center gap-2 px-4 text-center" style={{ "--i": index } as CSSProperties}>
      <Icon aria-hidden strokeWidth={1.25} className="size-8" />
      <h3 className="type-heading">{title}</h3>
      <p className="text-muted-foreground type-body max-w-xs">{children}</p>
    </li>
  );
}

/**
 * What a shopper wants to know before buying, in the three lines every shop has: what delivery costs,
 * how fast it can be, and that paying is safe. The figures are read from the endpoint checkout charges by.
 */
export function Services() {
  const { data } = useQuery({ queryKey: queryKeys.shippingMethods, queryFn: fetchShippingMethods, staleTime: 600_000 });
  const express = data?.items.find((method) => method.id === "express");
  const free = data?.free_shipping_threshold_cents ?? 0;
  return (
    <section aria-label="Delivery and payment" className="container-page pt-10 pb-14 md:pt-14 md:pb-20">
      <ul className="grid gap-10 md:grid-cols-3 md:gap-6">
        <Service icon={Truck} title="Free delivery" index={0}>
          {data && free > 0 ? (
            <>
              On every order over <Price cents={free} currency={data.currency} />.
            </>
          ) : (
            "Delivery options are shown at checkout."
          )}
        </Service>
        <Service icon={Zap} title="Express delivery" index={1}>
          {express ? `Arrives in ${express.estimated_days}.` : "Choose it at checkout when you need it sooner."}
        </Service>
        <Service icon={Lock} title="Secure checkout" index={2}>
          Pay by card. You see the full total, delivery included, before you confirm.
        </Service>
      </ul>
    </section>
  );
}
