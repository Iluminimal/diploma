"use client";

import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Download, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { BarList } from "@/components/admin/bar-list";
import { Panel } from "@/components/admin/panel";
import { SegmentedNav } from "@/components/admin/segmented";
import { Sparkline } from "@/components/admin/sparkline";
import { Stat } from "@/components/admin/stat";
import { Price } from "@/components/product/price";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-store";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { useUserMessage } from "@/lib/api/use-user-message";
import { STATS_PERIODS, downloadStatsCsv, type AdminStats, type StatsPeriod } from "./admin-api";
import { useAuditText } from "./audit-text";
import { useDates } from "./format";
import { OrderStatusDot } from "./order-status";
import { AdminPageHeader } from "./page-header";
import { RevenueChart } from "./revenue-chart";
import { change, type Change } from "./stats";
import { useAdminAudit, useAdminStats } from "./use-admin";
import { QueryError } from "@/components/ui/query-error";

const ALL_AUDIT = { entity: "all", actor: 0, action: "", page: 1 } as const;

function PeriodPicker({ period }: { period: StatsPeriod }) {
  const t = useTranslations("admin.dashboard");
  const custom = period.start !== undefined;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedNav
        label={t("period")}
        value={custom ? "custom" : String(period.days)}
        items={[
          ...STATS_PERIODS.map((days) => ({
            key: String(days),
            label: days === 365 ? t("year") : t("days", { days }),
            href: days === 30 ? "/admin" : `/admin?days=${days}`,
          })),
          ...(custom ? [{ key: "custom", label: t("custom"), href: `/admin?start=${period.start}&end=${period.end}` }] : []),
        ]}
      />
      <form method="get" action="/admin" aria-label={t("customRange")} className="flex flex-wrap items-center gap-1.5 text-sm">
        <label className="text-muted-foreground sr-only" htmlFor="period-start">
          {t("from")}
        </label>
        <input
          id="period-start"
          type="date"
          name="start"
          required
          max={today}
          defaultValue={period.start}
          className="border-field bg-background focus-visible:ring-ring/50 h-8 rounded-lg border px-2 text-sm outline-none focus-visible:ring-3"
        />
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        <label className="sr-only" htmlFor="period-end">
          {t("to")}
        </label>
        <input
          id="period-end"
          type="date"
          name="end"
          required
          max={today}
          defaultValue={period.end}
          className="border-field bg-background focus-visible:ring-ring/50 h-8 rounded-lg border px-2 text-sm outline-none focus-visible:ring-3"
        />
        <Button type="submit" size="sm" variant="outline">
          {t("apply")}
        </Button>
      </form>
    </div>
  );
}

/** Хугацааны тайланг CSV болгож татна (token-той хүсэлтээр: энгийн холбоос Authorization илгээхгүй). */
function ExportButton({ period }: { period: StatsPeriod }) {
  const t = useTranslations("admin.dashboard");
  const userMessage = useUserMessage();
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      await downloadStatsCsv(period);
    } catch (error) {
      toast.error(userMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={download} disabled={busy}>
      <Download aria-hidden className="size-4" /> {busy ? t("exporting") : t("export")}
    </Button>
  );
}

function Delta({ value, days }: { value: Change; days: number }) {
  const t = useTranslations("admin.dashboard");
  if (value.kind === "none") return <span className="text-muted-foreground text-xs">{t("noSales")}</span>;
  if (value.kind === "new") return <span className="text-success text-xs font-medium">{t("newPeriod")}</span>;
  const Icon = value.kind === "up" ? ArrowUpRight : value.kind === "down" ? ArrowDownRight : Minus;
  const tone = value.kind === "up" ? "text-success" : value.kind === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 text-xs", tone)}>
      <Icon aria-hidden className="size-3.5" />
      <span className="font-medium">
        <span className="sr-only">{value.kind === "flat" ? t("unchanged") : value.kind === "up" ? t("up") : t("down")}</span>
        {value.kind === "flat" ? "0%" : `${value.percent}%`}
      </span>
      <span className="text-muted-foreground">{t("vsPrevious", { days })}</span>
    </span>
  );
}

function Attention({ stats }: { stats: AdminStats }) {
  const t = useTranslations("admin.dashboard");
  const items = (
    [
      { count: stats.to_ship, key: "toShip", href: "/admin/orders?status=paid" },
      { count: stats.awaiting_payment, key: "awaitingPayment", href: "/admin/orders?status=pending" },
      { count: stats.low_stock_total, key: "lowStock", href: "/admin/products?stock=low" },
      { count: stats.out_of_stock_total, key: "soldOut", href: "/admin/products?stock=out" },
    ] as const
  ).filter((item) => item.count > 0);

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <CheckCircle2 aria-hidden className="text-success size-4" /> {t("allCaughtUp")}
      </p>
    );
  }
  return (
    <ul className="divide-border/70 -my-2 divide-y">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="focus-visible:ring-ring/50 hover:text-brand group flex items-center gap-3 rounded-md py-3 text-sm outline-none focus-visible:ring-3"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-warning/20">
              <AlertTriangle aria-hidden className="size-4 text-warning-foreground" />
            </span>
            <span className="flex-1">{t(item.key, { count: item.count })}</span>
            <ArrowRight aria-hidden className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProductThumb({ src, size }: { src: string; size: number }) {
  return (
    <Image
      src={src}
      alt=""
      width={400}
      height={533}
      sizes={`${size}px`}
      className="bg-muted shrink-0 rounded-lg object-cover"
      style={{ width: size, height: Math.round(size * 1.3) }}
    />
  );
}

/** Нийт дотор эзлэх хувь: 0-ээс их боловч 1%-иас бага бол "<1%", тэгэхгүй бол "0%" гэж хуурахгүй. */
export function share(part: number, whole: number): string | undefined {
  if (whole <= 0) return undefined;
  const value = (part / whole) * 100;
  return part > 0 && value < 1 ? "<1%" : `${Math.round(value)}%`;
}

function percent(value: number | null) {
  return value === null ? null : `${Math.round(value * 1000) / 10}%`;
}

function Operations({ stats }: { stats: AdminStats }) {
  const t = useTranslations("admin.dashboard");
  const rows = [
    {
      key: "overdue",
      label: t("opsOverdue"),
      hint: t("opsOverdueHint", { hours: stats.ship_sla_hours }),
      value: String(stats.overdue_to_ship),
      tone: stats.overdue_to_ship > 0 ? "text-destructive" : undefined,
      href: stats.overdue_to_ship > 0 ? "/admin/orders?status=paid" : undefined,
    },
    {
      key: "ship",
      label: t("opsShipTime"),
      value: stats.avg_ship_hours === null ? null : t("hours", { value: stats.avg_ship_hours }),
    },
    { key: "refund", label: t("opsRefundRate"), value: percent(stats.refund_rate) },
    { key: "cancel", label: t("opsCancelRate"), value: percent(stats.cancel_rate) },
  ];
  return (
    <dl className="divide-border/70 -my-2 divide-y">
      {rows.map((row) => (
        <div key={row.key} className="flex items-baseline justify-between gap-3 py-3 text-sm">
          <dt>
            {row.href ? (
              <Link href={row.href} className="hover:text-brand hover:underline">
                {row.label}
              </Link>
            ) : (
              row.label
            )}
            {row.hint && <span className="text-muted-foreground block text-xs">{row.hint}</span>}
          </dt>
          <dd className={cn("font-medium tabular-nums", row.tone, row.value === null && "text-muted-foreground font-normal")}>
            {row.value ?? t("noData")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Funnel({ stats }: { stats: AdminStats }) {
  const t = useTranslations("admin.dashboard");
  const { funnel } = stats;
  const steps = ["created", "paid", "shipped", "delivered", "cancelled", "refunded"] as const;
  return (
    <BarList
      label={t("funnelTitle")}
      bars={steps.map((step) => ({
        key: step,
        label: t(`funnel.${step}`),
        value: funnel[step],
        display: funnel[step],
        hint: step === "created" ? undefined : share(funnel[step], funnel.created),
        className: step === "cancelled" ? "bg-destructive/70" : step === "refunded" ? "bg-muted-foreground/60" : undefined,
      }))}
    />
  );
}

function Categories({ stats }: { stats: AdminStats }) {
  const t = useTranslations("admin.dashboard");
  const total = stats.by_category.reduce((sum, c) => sum + c.revenue_cents, 0);
  return (
    <BarList
      label={t("categoriesTitle")}
      bars={stats.by_category.map((category) => ({
        key: category.name ?? "other",
        label: category.name ?? t("categoryOther"),
        value: category.revenue_cents,
        display: <Price cents={category.revenue_cents} currency={stats.currency} />,
        hint: share(category.revenue_cents, total),
      }))}
    />
  );
}

function StaffActivity() {
  const t = useTranslations("admin.dashboard");
  const dates = useDates();
  const text = useAuditText();
  const { data } = useAdminAudit(ALL_AUDIT);
  const entries = data?.items.slice(0, 8) ?? [];
  return (
    <Panel
      id="activity-heading"
      title={t("activityTitle")}
      action={
        <Link href="/admin/activity" className="text-brand text-sm hover:underline">
          {t("activityAll")}
        </Link>
      }
    >
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noActivity")}</p>
      ) : (
        <ul className="divide-border/70 -my-2 divide-y">
          {entries.map((entry) => {
            const { what, object, href, who } = text(entry);
            return (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm">
                <span className="text-muted-foreground max-w-40 truncate">{who}</span>
                <span className="font-medium">{what}</span>
                <Link href={href} className="text-brand hover:underline">
                  {object}
                </Link>
                <span className="text-muted-foreground ml-auto text-xs">{dates.when(entry.created_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function AdminDashboard({ period }: { period: StatsPeriod }) {
  const t = useTranslations("admin.dashboard");
  const dates = useDates();
  const name = useAuth((state) => state.user?.full_name)?.split(" ")[0];
  const { data: stats, error, refetch, isFetching } = useAdminStats(period);

  return (
    <div>
      <AdminPageHeader
        title={t("title")}
        description={name ? `${t("greeting", { name })} ${t("description")}` : t("description")}
        actions={
          <>
            <PeriodPicker period={period} />
            <ExportButton period={period} />
          </>
        }
      />
      {error && !stats ? (
        <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
      ) : !stats ? (
        <div aria-busy aria-label={t("loading")} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-36 rounded-[var(--radius-tile)]" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-[var(--radius-tile)]" />
        </div>
      ) : (
        <div className="space-y-4 md:space-y-6" aria-busy={isFetching}>
          <dl className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3" aria-label={t("keyFigures", { days: stats.days })}>
            <Stat
              label={t("revenue")}
              value={<Price cents={stats.revenue_cents.current} currency={stats.currency} />}
              footer={
                <>
                  <Delta value={change(stats.revenue_cents.current, stats.revenue_cents.previous)} days={stats.days} />
                  <Sparkline values={stats.series.map((p) => p.revenue_cents)} className="text-brand mt-2" />
                </>
              }
            />
            <Stat
              label={t("orders")}
              value={stats.orders.current}
              footer={
                <>
                  <Delta value={change(stats.orders.current, stats.orders.previous)} days={stats.days} />
                  <Sparkline values={stats.series.map((p) => p.orders)} className="text-brand mt-2" />
                </>
              }
            />
            <Stat
              label={t("averageOrder")}
              value={<Price cents={stats.average_order_cents.current} currency={stats.currency} />}
              footer={<Delta value={change(stats.average_order_cents.current, stats.average_order_cents.previous)} days={stats.days} />}
            />
            <Stat
              label={t("unitsLabel")}
              value={stats.units.current}
              footer={
                <>
                  <Delta value={change(stats.units.current, stats.units.previous)} days={stats.days} />
                  <Sparkline values={stats.series.map((p) => p.units)} className="text-brand mt-2" />
                </>
              }
            />
            <Stat
              label={t("newCustomers")}
              value={stats.new_customers.current}
              footer={
                <>
                  <Delta value={change(stats.new_customers.current, stats.new_customers.previous)} days={stats.days} />
                  <Sparkline values={stats.series.map((p) => p.new_customers)} className="text-brand mt-2" />
                </>
              }
            />
            <Stat
              label={t("repeatCustomers")}
              value={percent(stats.repeat_customer_rate) ?? "–"}
              footer={
                <span className="text-muted-foreground text-xs">
                  {stats.repeat_customer_rate === null ? t("noBuyers") : t("repeatHint")}
                </span>
              }
            />
          </dl>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
            <Panel id="revenue-heading" title={t("revenueByDay")} className="lg:col-span-2">
              <RevenueChart stats={stats} />
            </Panel>
            <Panel id="attention-heading" title={t("needsAttention")}>
              <Attention stats={stats} />
            </Panel>
          </div>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
            <Panel id="funnel-heading" title={t("funnelTitle")} description={t("funnelDescription")} className="lg:col-span-2">
              <Funnel stats={stats} />
            </Panel>
            <Panel id="ops-heading" title={t("opsTitle")}>
              <Operations stats={stats} />
            </Panel>
          </div>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
            <Panel id="categories-heading" title={t("categoriesTitle")} className="lg:col-span-2">
              {stats.by_category.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("nothingSold")}</p>
              ) : (
                <Categories stats={stats} />
              )}
            </Panel>
            <Panel id="top-heading" title={t("topProducts", { days: stats.days })}>
              {stats.top_products.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("nothingSold")}</p>
              ) : (
                <ol className="space-y-3.5">
                  {stats.top_products.map((product, index) => (
                    <li key={product.product_id} className="flex items-center gap-3 text-sm">
                      <span aria-hidden className="text-muted-foreground w-4 text-center text-xs font-semibold tabular-nums">
                        {index + 1}
                      </span>
                      <ProductThumb src={product.image.thumb_400} size={36} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/products/${product.product_id}`} className="line-clamp-1 font-medium hover:underline">
                          {product.name}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          {t("unitsSold", { units: product.units })} · <Price cents={product.revenue_cents} currency={stats.currency} />
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
            <Panel
              id="recent-heading"
              title={t("recentOrders")}
              className="lg:col-span-2"
              action={
                <Link href="/admin/orders" className="text-brand text-sm hover:underline">
                  {t("allOrders")}
                </Link>
              }
            >
              {stats.recent_orders.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("noOrders")}</p>
              ) : (
                <ul className="divide-border/70 -my-2 divide-y">
                  {stats.recent_orders.map((order) => (
                    <li key={order.number} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                      <Link href={`/admin/orders/${order.number}`} className="font-medium hover:underline">
                        {order.number}
                      </Link>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate">
                        {order.customer_name} · {dates.when(order.created_at)}
                      </span>
                      <OrderStatusDot status={order.status} />
                      <Price cents={order.total_cents} currency={order.currency} className="w-20 text-right font-medium" />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <StaffActivity />
          </div>

          {stats.low_stock.length > 0 && (
            <Panel
              id="low-heading"
              title={t("lowOnStock", { threshold: stats.low_stock_threshold })}
              action={
                <Link href="/admin/products?stock=low" className="text-brand text-sm hover:underline">
                  {t("openInventory")}
                </Link>
              }
            >
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stats.low_stock.map((product) => (
                  <li key={product.id} className="bg-muted/60 flex items-center gap-3 rounded-2xl p-2.5 text-sm">
                    <ProductThumb src={product.image.thumb_400} size={40} />
                    <div className="min-w-0">
                      <Link href={`/admin/products/${product.id}`} className="line-clamp-1 font-medium hover:underline">
                        {product.name}
                      </Link>
                      <span className="text-destructive text-xs font-medium">{t("left", { count: product.stock_quantity })}</span>
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
