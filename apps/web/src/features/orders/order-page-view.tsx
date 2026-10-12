"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-store";
import { ApiError, userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import { OrderDetail } from "./order-detail";
import { OrderTimeline } from "./order-events";
import { OrderProgress } from "./order-progress";
import { fetchOrder } from "./orders-api";
import { Skeleton } from "@/components/ui/skeleton";

export function OrderPageView({ number }: { number: string }) {
  const status = useAuth((state) => state.status);
  const { data: order, error } = useQuery({
    queryKey: queryKeys.order(number),
    queryFn: () => fetchOrder(number),
    enabled: status === "signedIn",
  });

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/account/orders" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" /> All orders
      </Link>
      <h2 className="type-title">Order {number}</h2>
      {error ? (
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? "We couldn't find that order on your account." : userMessage(error)}
        </p>
      ) : order ? (
        <div className="space-y-10">
          <div className="space-y-4">
            <OrderProgress
              order={{ ...order, cancelled_at: order.events.find((event) => event.type === "cancelled")?.at }}
            />
            {order.tracking_number && (
              <p className="bg-secondary/60 rounded-xl px-4 py-3 text-sm">
                <span className="text-muted-foreground">Tracking{order.carrier ? ` with ${order.carrier}` : ""}: </span>
                <span className="font-mono font-medium break-all">{order.tracking_number}</span>
              </p>
            )}
          </div>
          <OrderDetail order={order} reviewLinks />
          <section aria-labelledby="history-heading" className="space-y-4">
            <h2 id="history-heading" className="font-semibold">
              Order history
            </h2>
            <OrderTimeline events={order.events} currency={order.currency} />
          </section>
        </div>
      ) : (
        <Skeleton aria-busy aria-label="Loading the order" className="h-64 rounded-2xl" />
      )}
    </div>
  );
}
