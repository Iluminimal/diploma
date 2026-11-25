"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-store";
import { ApiError } from "@/lib/api/errors";
import { useUserMessage } from "@/lib/api/use-user-message";
import { queryKeys } from "@/lib/query-keys";
import { OrderDetail } from "./order-detail";
import { OrderTimeline } from "./order-events";
import { OrderProgress } from "./order-progress";
import { ReorderButton } from "./reorder-button";
import { fetchOrder } from "./orders-api";
import { Skeleton } from "@/components/ui/skeleton";
import { hasOpenInvoice, PendingOrderPanel } from "@/features/checkout/pending-order-panel";

export function OrderPageView({ number }: { number: string }) {
  const t = useTranslations("orders.page");
  const userMessage = useUserMessage();
  const status = useAuth((state) => state.status);
  const { data: order, error } = useQuery({
    queryKey: queryKeys.order(number),
    queryFn: () => fetchOrder(number),
    enabled: status === "signedIn",
  });

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/account/orders" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 type-caption">
        <ArrowLeft className="size-4" /> {t("allOrders")}
      </Link>
      <h2 className="type-title">{t("order", { number })}</h2>
      {error ? (
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? t("notFound") : userMessage(error)}
        </p>
      ) : order ? (
        <div className="space-y-10">
          <div className="space-y-4">
            <OrderProgress
              order={{ ...order, cancelled_at: order.events.find((event) => event.type === "cancelled")?.at }}
            />
            {order.tracking_number && (
              <p className="bg-secondary/60 rounded-xl px-4 py-3 type-caption">
                <span className="text-muted-foreground">{order.carrier ? t("trackingWith", { carrier: order.carrier }) : t("tracking")}</span>
                <span className="font-mono font-medium break-all">{order.tracking_number}</span>
              </p>
            )}
          </div>
          {hasOpenInvoice(order) && <PendingOrderPanel order={order} />}
          <OrderDetail order={order} reviewLinks />
          {order.status !== "pending" && <ReorderButton number={order.number} />}
          <section aria-labelledby="history-heading" className="space-y-4">
            <h2 id="history-heading" className="font-semibold">
              {t("history")}
            </h2>
            <OrderTimeline events={order.events} currency={order.currency} />
          </section>
        </div>
      ) : (
        <Skeleton aria-busy aria-label={t("loading")} className="h-64 rounded-[var(--radius-tile)]" />
      )}
    </div>
  );
}
