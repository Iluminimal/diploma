"use client";

import { AnimatedNumber } from "@/components/motion/animated-number";
import { formatPrice } from "@/features/catalog/product";
import { cn } from "@/lib/utils";

/** `Price` for a total that changes while you watch (the cart): it counts to the new amount. */
export function AnimatedPrice({
  cents,
  currency = "USD",
  className,
}: {
  cents: number;
  currency?: string;
  className?: string;
}) {
  return (
    <AnimatedNumber
      value={cents}
      format={(value) => formatPrice(value, currency)}
      className={cn("tabular-nums", className)}
    />
  );
}
