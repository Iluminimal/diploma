import { BASE_CURRENCY } from "@/i18n/currency";
import { useFormat } from "@/i18n/use-format";
import { cn } from "@/lib/utils";

export function Price({
  cents,
  currency = BASE_CURRENCY,
  className,
}: {
  cents: number;
  currency?: string;
  className?: string;
}) {
  const format = useFormat();
  return <span className={cn("tabular-nums", className)}>{format.price(cents, currency)}</span>;
}
