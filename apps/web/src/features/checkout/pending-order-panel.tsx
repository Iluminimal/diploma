"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Order } from "@/features/orders/orders-api";
import { accountKeys, queryKeys } from "@/lib/query-keys";
import { QPayPanel } from "./qpay-panel";

/** QPay-ээр төлөх захиалга (төлбөр хүлээж буй, QR-тай): захиалгын хуудас болон баталгаажуулалтын хуудас. */
export function hasOpenInvoice(order: Order): order is Order & { qpay: NonNullable<Order["qpay"]>; charge: NonNullable<Order["charge"]> } {
  return order.status === "pending" && Boolean(order.qpay) && Boolean(order.charge);
}

/**
 * Хуудас шинэчлэгдсэн ч, банкны апп-аас буцаж ирсэн ч төлбөр хүлээж буй захиалгын QR, тоолуур, цуцлах
 * товч хэвээр байна: төлбөр "алга болохгүй".
 */
export function PendingOrderPanel({ order }: { order: Order & { qpay: NonNullable<Order["qpay"]>; charge: NonNullable<Order["charge"]> } }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const refresh = () => Promise.all(accountKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  return (
    <QPayPanel
      number={order.number}
      charge={order.charge}
      qpay={order.qpay}
      expiresAt={order.expires_at}
      onPaid={(paid) => {
        queryClient.setQueryData(queryKeys.order(order.number), paid);
        void refresh();
      }}
      onCancelled={() => {
        void refresh();
        router.push("/cart");
      }}
    />
  );
}
