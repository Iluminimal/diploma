"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { useFormat } from "@/i18n/use-format";
import { queryKeys } from "@/lib/query-keys";
import { fetchOrders } from "./orders-api";
import { StatusBadge } from "./status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";

export function OrdersList({ page }: { page: number }) {
  const t = useTranslations("orders.list");
  const format = useFormat();
  const status = useAuth((state) => state.status);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: [...queryKeys.orders, page],
    queryFn: () => fetchOrders(page),
    enabled: status === "signedIn",
  });

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy aria-label={t("loading")}>
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-28 rounded-[var(--radius-tile)]" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
    );
  }
  if (data.total === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-14 text-center">
        <span className="bg-muted grid size-14 place-items-center rounded-full">
          <Package className="text-muted-foreground size-6" />
        </span>
        <div className="space-y-1">
          <h2 className="type-intro font-medium">{t("none")}</h2>
          <p className="text-muted-foreground type-caption">{t("noneHint")}</p>
        </div>
        <Button asChild size="lg">
          <Link href="/products">{t("startShopping")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-3" aria-label={t("orders")}>
        {data.items.map((order) => (
          <li key={order.number}>
            <Link
              href={`/account/orders/${order.number}`}
              className="tile hover:bg-muted focus-visible:ring-ring/50 flex flex-wrap items-center gap-x-6 gap-y-3 p-5 transition-colors outline-none focus-visible:ring-3 sm:p-6"
            >
              <div className="flex -space-x-3" aria-hidden>
                {order.images.map((image, i) => (
                  <Image
                    key={i}
                    src={image.thumb_400}
                    alt=""
                    width={400}
                    height={533}
                    sizes="48px"
                    className="bg-muted ring-background size-12 rounded-full object-cover ring-2"
                  />
                ))}
              </div>
              <div className="min-w-40 flex-1 space-y-1">
                <p className="font-medium">{order.number}</p>
                <p className="text-muted-foreground type-caption">
                  {t("meta", { date: format.date(order.created_at, { dateStyle: "medium" }), count: order.item_count })}
                </p>
              </div>
              <StatusBadge status={order.status} />
              <span className="type-caption font-semibold tabular-nums">
                {format.price(order.total_cents, order.currency)}
              </span>
              <ChevronRight aria-hidden className="text-muted-foreground hidden size-4 sm:block" />
            </Link>
          </li>
        ))}
      </ul>
      {data.pages > 1 && (
        <nav aria-label={t("pages")} className="flex items-center justify-between type-caption">
          {page > 1 ? (
            <Link href={`/account/orders?page=${page - 1}`} className="inline-flex items-center gap-1 font-medium">
              <ChevronLeft className="size-4" /> {t("newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            {t("pageOf", { page, pages: data.pages })}
          </span>
          {page < data.pages ? (
            <Link href={`/account/orders?page=${page + 1}`} className="inline-flex items-center gap-1 font-medium">
              {t("older")} <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
