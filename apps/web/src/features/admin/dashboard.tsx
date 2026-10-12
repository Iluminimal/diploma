"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Minus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Price } from "@/components/price";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/features/orders/status-badge";
import { userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { STATS_PERIODS, type AdminStats } from "./admin-api";
import { AdminPageHeader } from "./page-header";
import { RevenueChart } from "./revenue-chart";
import { change, type Change } from "./stats";
import { useAdminStats } from "./use-admin";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function Panel({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "bg-background border-border rounded-2xl border p-4 md:p-5",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PeriodPicker({ days }: { days: number }) {
  return (
    <nav
      aria-label="Period"
      className="bg-background border-border flex rounded-full border p-0.5 text-sm"
    >
      {STATS_PERIODS.map((period) => (
        <Link
          key={period}
          href={period === 30 ? "/admin" : `/admin?days=${period}`}
          aria-current={period === days ? "page" : undefined}
          className={cn(
            "focus-visible:ring-ring/60 rounded-full px-3.5 py-1.5 font-medium outline-none focus-visible:ring-3",
            period === days
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {period} days
        </Link>
      ))}
    </nav>
  );
}

function Delta({ value, days }: { value: Change; days: number }) {
  if (value.kind === "none")
    return (
      <span className="text-muted-foreground text-xs">
        No sales in either period
      </span>
    );
  if (value.kind === "new")
    return (
      <span className="text-success text-xs font-medium">
        New: nothing in the period before
      </span>
    );
  const Icon =
    value.kind === "up"
      ? ArrowUpRight
      : value.kind === "down"
        ? ArrowDownRight
        : Minus;
  const tone =
    value.kind === "up"
      ? "text-success"
      : value.kind === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", tone)}>
      <Icon aria-hidden className="size-3.5" />
      <span className="font-medium">
        <span className="sr-only">
          {value.kind === "flat"
            ? "Unchanged"
            : value.kind === "up"
              ? "Up "
              : "Down "}
        </span>
        {value.kind === "flat" ? "0%" : `${value.percent}%`}
      </span>
      <span className="text-muted-foreground">vs previous {days} days</span>
    </span>
  );
}

function Kpi({
  label,
  value,
  delta,
  days,
}: {
  label: string;
  value: ReactNode;
  delta: Change;
  days: number;
}) {
  return (
    <div className="bg-background border-border space-y-2 rounded-2xl border p-4 md:p-5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="space-y-1">
        <span className="block text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">
          {value}
        </span>
        <Delta value={delta} days={days} />
      </dd>
    </div>
  );
}

function Attention({ stats }: { stats: AdminStats }) {
  const items = [
    {
      count: stats.to_ship,
      label: (n: number) =>
        `${n} paid ${n === 1 ? "order is" : "orders are"} waiting to ship`,
      href: "/admin/orders?status=paid",
    },
    {
      count: stats.awaiting_payment,
      label: (n: number) =>
        `${n} ${n === 1 ? "order is" : "orders are"} awaiting payment`,
      href: "/admin/orders?status=pending",
    },
    {
      count: stats.low_stock_total,
      label: (n: number) =>
        `${n} ${n === 1 ? "product is" : "products are"} low on stock`,
      href: "/admin/inventory?stock=low",
    },
    {
      count: stats.out_of_stock_total,
      label: (n: number) =>
        `${n} ${n === 1 ? "product is" : "products are"} sold out`,
      href: "/admin/inventory?stock=out",
    },
  ].filter((item) => item.count > 0);

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <CheckCircle2 aria-hidden className="text-success size-4" /> You&apos;re
        all caught up.
      </p>
    );
  }
  return (
    <ul className="divide-border -my-1 divide-y">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="focus-visible:ring-ring/60 hover:text-brand flex items-center gap-3 rounded-md py-3 text-sm outline-none focus-visible:ring-3"
          >
            <AlertTriangle
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
            <span className="flex-1">{item.label(item.count)}</span>
            <ArrowRight aria-hidden className="text-muted-foreground size-4" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AdminDashboard({ days }: { days: number }) {
  const { data: stats, error, refetch, isFetching } = useAdminStats(days);

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        description="How the shop is doing."
        actions={<PeriodPicker days={days} />}
      />
      {error && !stats ? (
        <div className="space-y-3">
          <p role="alert" className="text-destructive">
            {userMessage(error)}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : !stats ? (
        <div aria-busy aria-label="Loading the dashboard" className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4 md:space-y-6" aria-busy={isFetching}>
          <dl
            className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
            aria-label={`Key figures for the last ${stats.days} days`}
          >
            <Kpi
              label="Revenue"
              value={
                <Price
                  cents={stats.revenue_cents.current}
                  currency={stats.currency}
                />
              }
              delta={change(
                stats.revenue_cents.current,
                stats.revenue_cents.previous,
              )}
              days={stats.days}
            />
            <Kpi
              label="Orders"
              value={stats.orders.current}
              delta={change(stats.orders.current, stats.orders.previous)}
              days={stats.days}
            />
            <Kpi
              label="Average order"
              value={
                <Price
                  cents={stats.average_order_cents.current}
                  currency={stats.currency}
                />
              }
              delta={change(
                stats.average_order_cents.current,
                stats.average_order_cents.previous,
              )}
              days={stats.days}
            />
            <Kpi
              label="New customers"
              value={stats.new_customers.current}
              delta={change(
                stats.new_customers.current,
                stats.new_customers.previous,
              )}
              days={stats.days}
            />
          </dl>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
            <Panel
              id="revenue-heading"
              title="Revenue by day"
              className="lg:col-span-2"
            >
              <RevenueChart stats={stats} />
            </Panel>
            <Panel id="attention-heading" title="Needs attention">
              <Attention stats={stats} />
            </Panel>
          </div>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
            <Panel
              id="recent-heading"
              title="Recent orders"
              className="lg:col-span-2"
              action={
                <Link
                  href="/admin/orders"
                  className="text-brand text-sm hover:underline"
                >
                  All orders
                </Link>
              }
            >
              {stats.recent_orders.length === 0 ? (
                <p className="text-muted-foreground text-sm">No orders yet.</p>
              ) : (
                <ul className="divide-border -my-2 divide-y">
                  {stats.recent_orders.map((order) => (
                    <li
                      key={order.number}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm"
                    >
                      <Link
                        href={`/admin/orders/${order.number}`}
                        className="font-medium hover:underline"
                      >
                        {order.number}
                      </Link>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate">
                        {order.customer_name} · {when(order.created_at)}
                      </span>
                      <StatusBadge status={order.status} />
                      <Price
                        cents={order.total_cents}
                        currency={order.currency}
                        className="w-20 text-right font-medium"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel id="top-heading" title={`Top products, ${stats.days} days`}>
              {stats.top_products.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing sold in this period.
                </p>
              ) : (
                <ol className="space-y-3">
                  {stats.top_products.map((product) => (
                    <li
                      key={product.product_id}
                      className="flex items-center gap-3 text-sm"
                    >
                      <Image
                        src={product.image.thumb_400}
                        alt=""
                        width={400}
                        height={533}
                        sizes="40px"
                        className="bg-muted h-12 w-9 shrink-0 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/products/${product.product_id}`}
                          className="line-clamp-1 font-medium hover:underline"
                        >
                          {product.name}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          {product.units} sold ·{" "}
                          <Price
                            cents={product.revenue_cents}
                            currency={stats.currency}
                          />
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>

          {stats.low_stock.length > 0 && (
            <Panel
              id="low-heading"
              title={`Low on stock (${stats.low_stock_threshold} or fewer)`}
              action={
                <Link
                  href="/admin/inventory?stock=low"
                  className="text-brand text-sm hover:underline"
                >
                  Open inventory
                </Link>
              }
            >
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stats.low_stock.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <Image
                      src={product.image.thumb_400}
                      alt=""
                      width={400}
                      height={533}
                      sizes="40px"
                      className="bg-muted h-12 w-9 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="line-clamp-1 font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      <span className="text-destructive text-xs font-medium">
                        {product.stock_quantity} left
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
