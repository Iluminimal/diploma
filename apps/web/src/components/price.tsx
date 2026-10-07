import { formatPrice } from "@/features/catalog/product";
import { cn } from "@/lib/utils";

export function Price({
  cents,
  currency = "USD",
  className,
}: {
  cents: number;
  currency?: string;
  className?: string;
}) {
  return <span className={cn("tabular-nums", className)}>{formatPrice(cents, currency)}</span>;
}
