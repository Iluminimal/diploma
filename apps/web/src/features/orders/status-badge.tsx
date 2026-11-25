import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Order } from "./orders-api";

const CLASSES: Record<Order["status"], string> = {
  paid: "bg-success/15 text-success",
  pending: "bg-muted text-muted-foreground",
  shipped: "bg-brand/10 text-brand",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-destructive/10 text-destructive-text",
  refunded: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: Order["status"] }) {
  const t = useTranslations("orders.status");
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 type-fine font-medium", CLASSES[status])}>{t(status)}</span>;
}
