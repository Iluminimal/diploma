"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-store";
import { ApiError, userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import { OrderDetail } from "./order-detail";
import { fetchOrder } from "./orders-api";

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
      <h2 className="text-xl font-semibold tracking-tight">Order {number}</h2>
      {error ? (
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? "We couldn't find that order on your account." : userMessage(error)}
        </p>
      ) : order ? (
        <OrderDetail order={order} />
      ) : (
        <div aria-busy aria-label="Loading the order" className="bg-muted h-64 animate-pulse rounded-2xl" />
      )}
    </div>
  );
}
