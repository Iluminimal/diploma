"use client";

import { useQuery } from "@tanstack/react-query";
import { PackageCheck, Truck } from "lucide-react";
import { Price } from "@/components/product/price";
import { fetchShippingMethods } from "@/features/checkout/checkout-api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * "You're $12 away from free shipping": subtotal өсөхөд дүүрдэг bar, хүрмэгц баталгаа болж хувирна.
 * Босгыг checkout-ын ашигладаг endpoint-оос авдаг (cache-тэй) тул checkout-ын авах дүнтэй хэзээ ч
 * зөрөхгүй. Мэдэгдэх хүртэл юу ч зурахгүй.
 */
export function FreeShippingProgress({ subtotalCents, className }: { subtotalCents: number; className?: string }) {
  const { data } = useQuery({
    queryKey: queryKeys.shippingMethods,
    queryFn: fetchShippingMethods,
    staleTime: 600_000,
  });
  if (!data || data.free_shipping_threshold_cents <= 0) return null;

  const threshold = data.free_shipping_threshold_cents;
  const unlocked = subtotalCents >= threshold;
  const percent = Math.min(100, Math.round((subtotalCents / threshold) * 100));
  const Icon = unlocked ? PackageCheck : Truck;

  return (
    <div className={cn("space-y-2", className)}>
      <p role="status" className="flex items-center gap-2 text-sm">
        <Icon aria-hidden className={cn("size-4 shrink-0", unlocked ? "text-success" : "text-muted-foreground")} />
        {unlocked ? (
          <span className="font-medium">You&apos;ve unlocked free shipping</span>
        ) : (
          <span>
            You&apos;re <Price cents={threshold - subtotalCents} currency={data.currency} className="font-semibold" /> away
            from free shipping
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Progress to free shipping"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="bg-muted h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-700 ease-out-expo",
            unlocked ? "bg-success" : "bg-foreground",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
