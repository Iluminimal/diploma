"use client";

import { AnimatedNumber } from "@/components/motion/animated-number";
import { formatPrice } from "@/features/catalog/product";
import { cn } from "@/lib/utils";

/** `Price`-ын нэг хувилбар, харж байхад өөрчлөгддөг нийлбэрт (сагс): шинэ дүн рүүгээ тоолно. */
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
