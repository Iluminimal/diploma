"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/price";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import { fetchOrders } from "./orders-api";
import { StatusBadge } from "./status-badge";
import { Skeleton } from "@/components/ui/skeleton";

export function OrdersList({ page }: { page: number }) {
  const status = useAuth((state) => state.status);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: [...queryKeys.orders, page],
    queryFn: () => fetchOrders(page),
    enabled: status === "signedIn",
  });

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy aria-label="Loading your orders">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          {userMessage(error)}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (data.total === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-14 text-center">
        <span className="bg-muted grid size-14 place-items-center rounded-full">
          <Package className="text-muted-foreground size-6" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-medium">No orders yet</h2>
          <p className="text-muted-foreground text-sm">When you place an order it will show up here.</p>
        </div>
        <Button asChild size="lg" className="h-11 rounded-xl px-5">
          <Link href="/products">Start shopping</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-3" aria-label="Orders">
        {data.items.map((order) => (
          <li key={order.number}>
            <Link
              href={`/account/orders/${order.number}`}
              className="border-border hover:border-foreground/40 focus-visible:ring-ring/60 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border p-4 transition-colors outline-none focus-visible:ring-3 sm:p-5"
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
                <p className="text-muted-foreground text-sm">
                  {new Date(order.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })} · {order.item_count}{" "}
                  {order.item_count === 1 ? "item" : "items"}
                </p>
              </div>
              <StatusBadge status={order.status} />
              <Price cents={order.total_cents} currency={order.currency} className="text-sm font-semibold" />
              <ChevronRight aria-hidden className="text-muted-foreground hidden size-4 sm:block" />
            </Link>
          </li>
        ))}
      </ul>
      {data.pages > 1 && (
        <nav aria-label="Orders pages" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={`/account/orders?page=${page - 1}`} className="inline-flex items-center gap-1 font-medium">
              <ChevronLeft className="size-4" /> Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page} of {data.pages}
          </span>
          {page < data.pages ? (
            <Link href={`/account/orders?page=${page + 1}`} className="inline-flex items-center gap-1 font-medium">
              Older <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
