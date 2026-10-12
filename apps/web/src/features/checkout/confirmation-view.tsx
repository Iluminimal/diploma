"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { AnimatedCheck } from "@/components/ui/animated-check";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { fetchOrder } from "@/features/orders/orders-api";
import { OrderDetail } from "@/features/orders/order-detail";
import { ApiError, userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";

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
        <h1 className="type-title">{missing ? "We couldn't find that order" : "Something went wrong"}</h1>
        <p role="alert" className="text-muted-foreground">
          {missing ? "It may belong to another account." : userMessage(error)}
        </p>
        <Button asChild variant="bordered">
          <Link href="/account/orders">Your orders</Link>
        </Button>
      </div>
    );
  }
  if (!order) {
    return <Skeleton aria-busy aria-label="Loading your order" className="h-64 rounded-[var(--radius-tile)]" />;
  }

  const Icon = order.status === "pending" ? Clock : XCircle;
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
        {order.status === "paid" ? (
          <AnimatedCheck className="text-success mx-auto sm:mx-0" />
        ) : (
          <Icon aria-hidden className="text-muted-foreground mx-auto size-10 sm:mx-0" />
        )}
        <h1 ref={heading} tabIndex={-1} className="type-display outline-none">
          {title}
        </h1>
        <p className="text-muted-foreground" role="status">
          Order <span className="text-foreground font-medium">{order.number}</span>. {lead}
        </p>
      </header>
      {order.status === "paid" && <WhatHappensNext email={order.contact_email} />}
      <OrderDetail order={order} />
      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg">
          <Link href="/products">Continue shopping</Link>
        </Button>
        <Button asChild variant="bordered" size="lg">
          <Link href="/account/orders">View all orders</Link>
        </Button>
      </div>
    </div>
  );
}

/** Three short steps after paying, each rising in a little after the one before. */
function WhatHappensNext({ email }: { email: string }) {
  const steps = [
    { title: "Confirmation sent", text: `A receipt is on its way to ${email}.` },
    { title: "We pack your order", text: "You'll get an email with the tracking number when it ships." },
    { title: "Follow it any time", text: "Your order page shows where it is, step by step." },
  ];
  return (
    <section aria-label="What happens next" className="tile p-6">
      <h2 className="type-heading mb-4">What happens next</h2>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards flex gap-3 duration-500"
            style={{ animationDelay: `${600 + i * 150}ms` }}
          >
            <span aria-hidden className="bg-background grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
              {i + 1}
            </span>
            <p className="text-sm">
              <span className="font-medium">{step.title}.</span> <span className="text-muted-foreground">{step.text}</span>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
