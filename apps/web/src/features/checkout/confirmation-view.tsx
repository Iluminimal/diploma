"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { fetchOrder } from "@/features/orders/orders-api";
import { OrderDetail } from "@/features/orders/order-detail";
import { ApiError, userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";

export function ConfirmationView({ number }: { number: string }) {
  const status = useAuth((state) => state.status);
  const heading = useRef<HTMLHeadingElement>(null);
  const { data: order, error } = useQuery({
    queryKey: queryKeys.order(number),
    queryFn: () => fetchOrder(number),
    enabled: status === "signedIn",
    // A payment confirmation can lag behind the redirect: keep looking until it settles.
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 2_000 : false),
  });

  // Move focus to the result so screen readers announce it after the redirect.
  useEffect(() => {
    if (order) heading.current?.focus();
  }, [order?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    const missing = error instanceof ApiError && error.isNotFound;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{missing ? "We couldn't find that order" : "Something went wrong"}</h1>
        <p role="alert" className="text-muted-foreground">
          {missing ? "It may belong to another account." : userMessage(error)}
        </p>
        <Button asChild variant="outline" className="h-10 rounded-xl px-4">
          <Link href="/account/orders">Your orders</Link>
        </Button>
      </div>
    );
  }
  if (!order) {
    return <div aria-busy aria-label="Loading your order" className="bg-muted h-64 animate-pulse rounded-2xl" />;
  }

  const Icon = order.status === "paid" ? CheckCircle2 : order.status === "pending" ? Clock : XCircle;
  const title =
    order.status === "paid"
      ? "Thank you for your order"
      : order.status === "pending"
        ? "Confirming your payment…"
        : "This order was cancelled";
  const lead =
    order.status === "paid"
      ? `We've emailed a confirmation to ${order.contact_email}.`
      : order.status === "pending"
        ? "This usually takes a few seconds."
        : "Your payment was not taken and the items were released.";

  return (
    <div className="space-y-8">
      <header className="space-y-3 text-center sm:text-left">
        <Icon
          aria-hidden
          className={order.status === "paid" ? "text-success mx-auto size-10 sm:mx-0" : "text-muted-foreground mx-auto size-10 sm:mx-0"}
        />
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none md:text-3xl">
          {title}
        </h1>
        <p className="text-muted-foreground" role="status">
          Order <span className="text-foreground font-medium">{order.number}</span>. {lead}
        </p>
      </header>
      <OrderDetail order={order} />
      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg" className="h-11 rounded-xl px-5">
          <Link href="/products">Continue shopping</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-11 rounded-xl px-5">
          <Link href="/account/orders">View all orders</Link>
        </Button>
      </div>
    </div>
  );
}
