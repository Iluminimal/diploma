"use client";

import { useTranslations } from "next-intl";
import { useUserMessage } from "@/lib/api/use-user-message";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { fetchOrder } from "@/features/orders/orders-api";
import { OrderDetail } from "@/features/orders/order-detail";
import { ApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { hasOpenInvoice, PendingOrderPanel } from "./pending-order-panel";

export function ConfirmationView({ number }: { number: string }) {
  const t = useTranslations("checkout.confirmation");
  const tc = useTranslations("checkout");
  const message = useUserMessage();
  const status = useAuth((state) => state.status);
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  // Сесс дууссан бол хуудас "ачаалж байна" гэж гацахгүй: нэвтэрч байгаад энд буцаж ирнэ.
  useEffect(() => {
    if (status === "signedOut") router.replace(`/login?next=${encodeURIComponent(`/checkout/confirmation/${number}`)}`);
  }, [status, number, router]);
  const { data: order, error } = useQuery({
    queryKey: queryKeys.order(number),
    queryFn: () => fetchOrder(number),
    enabled: status === "signedIn",
    // Төлбөрийн баталгаа redirect-ээс хоцорч болно: тогттол үргэлжлүүлэн шалгана.
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 2_000 : false),
  });

  // Redirect-ийн дараа screen reader зарлахын тулд focus-ыг үр дүн рүү шилжүүлнэ.
  useEffect(() => {
    if (order) heading.current?.focus();
  }, [order?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    const missing = error instanceof ApiError && error.isNotFound;
    return (
      <div className="space-y-4">
        <h1 className="type-title">{missing ? t("notFound") : t("wentWrong")}</h1>
        <p role="alert" className="text-muted-foreground">
          {missing ? t("elsewhere") : message(error)}
        </p>
        <Button asChild variant="bordered">
          <Link href="/account/orders">{t("yourOrders")}</Link>
        </Button>
      </div>
    );
  }
  if (!order) {
    return <Skeleton aria-busy aria-label={t("loading")} className="h-64 rounded-[var(--radius-tile)]" />;
  }

  const Icon = order.status === "paid" ? CheckCircle2 : order.status === "pending" ? Clock : XCircle;
  // QR-тай нээлттэй нэхэмжлэх: худалдан авагч төлөх ёстой (баталгаажуулалт хүлээж буй биш).
  const awaiting = hasOpenInvoice(order);
  const title =
    order.status === "paid" ? t("thanks") : awaiting ? t("awaiting") : order.status === "pending" ? t("confirming") : t("cancelled");
  const lead =
    order.status === "paid"
      ? t("leadPaid", { email: order.contact_email })
      : awaiting
        ? t("leadAwaiting")
        : order.status === "pending"
          ? t("leadPending")
          : t("leadCancelled");

  return (
    <div className="space-y-8">
      <header className="space-y-3 text-center sm:text-left">
        <Icon aria-hidden className={order.status === "paid" ? "text-success mx-auto size-10 sm:mx-0" : "text-muted-foreground mx-auto size-10 sm:mx-0"} />
        <h1 ref={heading} tabIndex={-1} className="type-display outline-none">
          {title}
        </h1>
        <p className="text-muted-foreground" role="status">
          {t.rich("orderLine", {
            number: order.number,
            lead,
            b: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
          })}
        </p>
      </header>
      {hasOpenInvoice(order) && <PendingOrderPanel order={order} />}
      {order.status === "paid" && <WhatHappensNext email={order.contact_email} />}
      <OrderDetail order={order} />
      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg">
          <Link href="/products">{tc("continueShopping")}</Link>
        </Button>
        <Button asChild variant="bordered" size="lg">
          <Link href="/account/orders">{t("viewAll")}</Link>
        </Button>
      </div>
    </div>
  );
}

/** Төлсний дараах гурван богино алхам, тус бүр өмнөхийнхөөс жаахан хоцорч гарна. */
function WhatHappensNext({ email }: { email: string }) {
  const t = useTranslations("checkout.confirmation.next");
  const steps = [
    { title: t("confirmationTitle"), text: t("confirmationText", { email }) },
    { title: t("packTitle"), text: t("packText") },
    { title: t("followTitle"), text: t("followText") },
  ];
  return (
    <section aria-label={t("heading")} className="tile p-6">
      <h2 className="type-heading mb-4">{t("heading")}</h2>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards flex gap-3 duration-500"
            style={{ animationDelay: `${600 + i * 150}ms` }}
          >
            <span aria-hidden className="bg-background grid size-6 shrink-0 place-items-center rounded-full type-fine font-semibold">
              {i + 1}
            </span>
            <p className="type-caption">
              <span className="font-medium">{step.title}.</span> <span className="text-muted-foreground">{step.text}</span>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
