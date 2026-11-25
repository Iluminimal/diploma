import { useTranslations } from "next-intl";
import { StatusDot, type Tone } from "@/components/admin/status-dot";
import type { Order } from "@/features/orders/orders-api";

/** Захиалгын төлөв бүрийн өнгө: "илгээх" (төлөгдсөн) нь админы үйлдэл хүлээж буй тул анхаарал татна. */
export const ORDER_TONE: Record<Order["status"], Tone> = {
  pending: "neutral",
  paid: "warning",
  shipped: "info",
  delivered: "success",
  cancelled: "danger",
  refunded: "neutral",
};

export function OrderStatusDot({ status }: { status: Order["status"] }) {
  const t = useTranslations("orders.status");
  return <StatusDot tone={ORDER_TONE[status]}>{t(status)}</StatusDot>;
}
