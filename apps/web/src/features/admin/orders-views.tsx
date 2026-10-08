"use client";

import { ArrowLeft, Package, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { selectClass } from "@/components/form-field";
import { Price } from "@/components/price";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderDetail } from "@/features/orders/order-detail";
import { StatusBadge } from "@/features/orders/status-badge";
import { ApiError, userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { OrderListParams } from "./admin-api";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { useAdminOrder, useAdminOrders } from "./use-admin";

const DEFAULTS = { q: "", status: "all", page: 1 };
const STATUS_LABELS: Record<OrderListParams["status"], string> = {
  all: "All orders",
  pending: "Awaiting payment",
  paid: "Paid",
  cancelled: "Cancelled",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function OrdersTable({ params }: { params: OrderListParams }) {
  const router = useRouter();
  const { data, isPending, error, refetch, isFetching } = useAdminOrders(params);
  const href = (change: Partial<OrderListParams>) =>
    `/admin/orders${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.replace(href({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim() }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form onSubmit={search} role="search" aria-label="Search orders" className="flex flex-1 gap-2 sm:max-w-md">
          <Input
            key={params.q}
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="Order number or customer email"
            aria-label="Order number or customer email"
            className="h-11 rounded-xl"
          />
          <Button type="submit" variant="outline" className="h-11 rounded-xl px-4">
            <Search aria-hidden /> Search
          </Button>
        </form>
        <select
          aria-label="Status"
          className={cn(selectClass, "w-auto")}
          value={params.status}
          onChange={(event) => router.replace(href({ status: event.target.value as OrderListParams["status"] }))}
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <div aria-busy aria-label="Loading orders" className="bg-muted h-80 animate-pulse rounded-2xl" />
      ) : error || !data ? (
        <div className="space-y-3">
          <p role="alert" className="text-destructive">
            {userMessage(error)}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : data.total === 0 ? (
        <div className="flex flex-col items-center gap-4 py-14 text-center">
          <span className="bg-muted grid size-14 place-items-center rounded-full">
            <Package aria-hidden className="text-muted-foreground size-6" />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-medium">No orders found</h2>
            <p className="text-muted-foreground text-sm">Orders appear here as customers check out.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4" aria-busy={isFetching}>
          <div className="border-border rounded-2xl border">
            <Table>
              <TableCaption>Orders, newest first</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Order</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((order) => (
                  <TableRow key={order.number}>
                    <TableCell>
                      <Link href={`/admin/orders/${order.number}`} className="font-medium hover:underline">
                        {order.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{when(order.created_at)}</TableCell>
                    <TableCell className="max-w-60">
                      <span className="block truncate">{order.customer_name}</span>
                      <span className="text-muted-foreground block truncate text-xs">{order.customer_email}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{order.item_count}</TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Price cents={order.total_cents} currency={order.currency} className="font-medium" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ListPagination
            label="Orders pages"
            page={data.page}
            pages={data.pages}
            total={data.total}
            hrefFor={(page) => href({ page })}
          />
        </div>
      )}
    </div>
  );
}

export function AdminOrderView({ number }: { number: string }) {
  const { data: order, error } = useAdminOrder(number);
  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/orders" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft aria-hidden className="size-4" /> All orders
      </Link>
      <h2 className="text-xl font-semibold tracking-tight">Order {number}</h2>
      {error ? (
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? "There is no such order." : userMessage(error)}
        </p>
      ) : order ? (
        <div className="space-y-8">
          <OrderDetail order={order} />
          <section aria-labelledby="payment-heading" className="border-border space-y-3 rounded-2xl border p-4 text-sm sm:p-5">
            <h3 id="payment-heading" className="font-semibold">
              Customer and payment
            </h3>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Customer</dt>
              <dd>
                {order.contact_email} <span className="text-muted-foreground">(account #{order.user_id})</span>
              </dd>
              {order.payment ? (
                <>
                  <dt className="text-muted-foreground">Payment</dt>
                  <dd>
                    {order.payment.status} via {order.payment.provider}
                  </dd>
                  <dt className="text-muted-foreground">Reference</dt>
                  <dd className="font-mono text-xs break-all">{order.payment.provider_payment_id}</dd>
                  {order.payment.last_error && (
                    <>
                      <dt className="text-muted-foreground">Last error</dt>
                      <dd>{order.payment.last_error}</dd>
                    </>
                  )}
                  {order.payment.refund_id && (
                    <>
                      <dt className="text-muted-foreground">Refund</dt>
                      <dd className="font-mono text-xs break-all">{order.payment.refund_id}</dd>
                    </>
                  )}
                </>
              ) : (
                <>
                  <dt className="text-muted-foreground">Payment</dt>
                  <dd>No payment started</dd>
                </>
              )}
              {order.status === "cancelled" && (
                <>
                  <dt className="text-muted-foreground">Cancelled</dt>
                  <dd>
                    {order.cancelled_at ? when(order.cancelled_at) : ""}
                    {order.cancel_reason ? ` · ${order.cancel_reason}` : ""}
                  </dd>
                </>
              )}
            </dl>
          </section>
        </div>
      ) : (
        <div aria-busy aria-label="Loading the order" className="bg-muted h-64 animate-pulse rounded-2xl" />
      )}
    </div>
  );
}
