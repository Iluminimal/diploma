"use client";

import { ArrowLeft, Package, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form-field";
import { Price } from "@/components/price";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { OrderDetail } from "@/features/orders/order-detail";
import { OrderTimeline } from "@/features/orders/order-events";
import { OrderProgress } from "@/features/orders/order-progress";
import type { Order } from "@/features/orders/orders-api";
import { StatusBadge } from "@/features/orders/status-badge";
import { ApiError, userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminOrder, OrderListParams } from "./admin-api";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { OrderActions } from "./order-actions";
import { AdminPageHeader } from "./page-header";
import { useAddOrderNote, useAdminOrder, useAdminOrders } from "./use-admin";

const DEFAULTS = { q: "", status: "all", page: 1 };
const TABS: { status: OrderListParams["status"]; label: string }[] = [
  { status: "all", label: "All" },
  { status: "pending", label: "Awaiting payment" },
  { status: "paid", label: "To ship" },
  { status: "shipped", label: "Shipped" },
  { status: "delivered", label: "Delivered" },
  { status: "cancelled", label: "Cancelled" },
  { status: "refunded", label: "Refunded" },
];

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function OrdersTable({ params }: { params: OrderListParams }) {
  const router = useRouter();
  const { data, isPending, error, refetch, isFetching } = useAdminOrders(params);
  const href = (change: Partial<OrderListParams>) =>
    `/admin/orders${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;
  const counts = data?.status_counts;
  const countOf = (status: OrderListParams["status"]) =>
    counts === undefined
      ? undefined
      : status === "all"
        ? Object.values(counts).reduce((sum, n) => sum + n, 0)
        : (counts[status] ?? 0);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.replace(href({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim() }));
  };

  return (
    <div>
      <AdminPageHeader title="Orders" description="Everything customers have ordered, newest first." />
      <div className="space-y-6">
        <nav aria-label="Order status" className="-mx-1 overflow-x-auto px-1 pb-1">
          <ul className="flex gap-1">
            {TABS.map(({ status, label }) => {
              const current = params.status === status;
              const count = countOf(status);
              return (
                <li key={status} className="shrink-0">
                  <Link
                    href={href({ status })}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "focus-visible:ring-ring/60 inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium outline-none focus-visible:ring-3",
                      current ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {label}{" "}
                    {count !== undefined && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-xs tabular-nums",
                          current ? "bg-background/20" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <form onSubmit={search} role="search" aria-label="Search orders" className="flex gap-2 sm:max-w-md">
          <Input
            key={params.q}
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="Order number or customer email"
            aria-label="Order number or customer email"
            className="h-11 rounded-xl"
          />
          <Button type="submit" variant="outline" className="h-11 rounded-full px-4">
            <Search aria-hidden /> Search
          </Button>
        </form>

        {isPending ? (
          <Skeleton aria-busy aria-label="Loading orders" className="h-80 rounded-2xl" />
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
            <div className="border-border bg-background rounded-2xl border">
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
    </div>
  );
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="bg-background border-border space-y-3 rounded-2xl border p-4 text-sm sm:p-5">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function AddNote({ number }: { number: string }) {
  const add = useAddOrderNote();
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const note = text.trim();
    if (!note) return;
    add.mutate(
      { number, text: note },
      {
        onSuccess: () => {
          setText("");
          toast.success("Note added.");
        },
      },
    );
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <Field id="order-note" label="Add a note" hint="Only administrators can see notes.">
        <Textarea
          id="order-note"
          aria-describedby="order-note-hint"
          maxLength={1000}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <Button type="submit" variant="outline" className="h-9 rounded-full px-4" disabled={add.isPending || !text.trim()}>
        {add.isPending ? "Adding…" : "Add note"}
      </Button>
    </form>
  );
}

function Fulfilment({ order }: { order: AdminOrder }) {
  if (!order.shipped_at && !order.tracking_number) return null;
  return (
    <Panel id="fulfilment-heading" title="Shipment">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr] lg:grid-cols-1">
        {order.carrier && (
          <div className="flex justify-between gap-4 lg:flex-col lg:gap-0.5">
            <dt className="text-muted-foreground">Carrier</dt>
            <dd>{order.carrier}</dd>
          </div>
        )}
        {order.tracking_number && (
          <div className="flex justify-between gap-4 lg:flex-col lg:gap-0.5">
            <dt className="text-muted-foreground">Tracking number</dt>
            <dd className="font-mono text-xs break-all">{order.tracking_number}</dd>
          </div>
        )}
        {order.shipped_at && (
          <div className="flex justify-between gap-4 lg:flex-col lg:gap-0.5">
            <dt className="text-muted-foreground">Shipped</dt>
            <dd>{when(order.shipped_at)}</dd>
          </div>
        )}
        {order.delivered_at && (
          <div className="flex justify-between gap-4 lg:flex-col lg:gap-0.5">
            <dt className="text-muted-foreground">Delivered</dt>
            <dd>{when(order.delivered_at)}</dd>
          </div>
        )}
      </dl>
    </Panel>
  );
}

export function AdminOrderView({ number }: { number: string }) {
  const { data: order, error } = useAdminOrder(number);
  const back = (
    <Link href="/admin/orders" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
      <ArrowLeft aria-hidden className="size-4" /> All orders
    </Link>
  );
  return (
    <div>
      <AdminPageHeader title={`Order ${number}`} back={back} actions={order && <OrderActions order={order} />} />
      {error ? (
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? "There is no such order." : userMessage(error)}
        </p>
      ) : order ? (
        <div className="space-y-6">
          <div className="bg-background border-border rounded-2xl border p-4 sm:p-6">
            <OrderProgress order={order} />
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="bg-background border-border rounded-2xl border p-4 sm:p-6">
              {/* What the customer sees of it: their view has no internal notes. */}
              <OrderDetail
                order={{ ...order, events: order.events.filter((event) => event.type !== "note") as Order["events"] }}
              />
            </div>
            <div className="space-y-6">
              <Fulfilment order={order} />
              <Panel id="payment-heading" title="Customer and payment">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr] lg:grid-cols-1">
                  <dt className="text-muted-foreground">Customer</dt>
                  <dd className="break-words">
                    <Link href={`/admin/customers/${order.user_id}`} className="hover:underline">
                      {order.contact_email}
                    </Link>{" "}
                    <span className="text-muted-foreground">(account #{order.user_id})</span>
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
              </Panel>
              <Panel id="history-heading" title="History">
                <OrderTimeline events={order.events} currency={order.currency} newestFirst />
                <AddNote number={order.number} />
              </Panel>
            </div>
          </div>
        </div>
      ) : (
        <Skeleton aria-busy aria-label="Loading the order" className="h-64 rounded-2xl" />
      )}
    </div>
  );
}
