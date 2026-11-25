"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/admin/panel";
import { Stat } from "@/components/admin/stat";
import { StatusDot } from "@/components/admin/status-dot";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-store";
import { cn } from "@/lib/utils";
import type { FulfillmentBoard, QueuedOrder } from "./admin-api";
import { useAuditText } from "./audit-text";
import { useDates } from "./format";
import { AdminPageHeader } from "./page-header";
import { useFulfillmentBoard, useSetStock } from "./use-admin";

function QueueRow({ order }: { order: QueuedOrder }) {
  const t = useTranslations("admin.warehouse");
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
      <div className="flex -space-x-2" aria-hidden>
        {order.lines.map((line, index) => (
          <Image
            key={index}
            src={line.image.thumb_400}
            alt=""
            width={80}
            height={104}
            sizes="32px"
            className="bg-muted border-background size-8 rounded-lg border-2 object-cover"
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/admin/orders/${order.number}`} className="font-medium hover:underline">
          {order.number}
        </Link>
        <span className="text-muted-foreground block truncate text-xs">
          {order.customer_name} · {t("items", { count: order.item_count })}
        </span>
      </div>
      {order.overdue ? (
        <StatusDot tone="danger">{t("overdueBadge")}</StatusDot>
      ) : null}
      <span className={cn("text-xs tabular-nums", order.overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
        {order.waiting_hours >= 48 ? t("waitingDays", { days: Math.floor(order.waiting_hours / 24) }) : t("waiting", { hours: order.waiting_hours })}
      </span>
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/orders/${order.number}`}>
          {t("ship")}
          <span className="sr-only"> {order.number}</span>
        </Link>
      </Button>
    </li>
  );
}

/** Нэг барааны үлдэгдлийг тэр дор нь тохируулах: тооллого хийх, нөхөх үед хуудас солихгүй. */
function StockRow({ product }: { product: FulfillmentBoard["stock_alerts"][number] }) {
  const t = useTranslations("admin.warehouse");
  const setStock = useSetStock();
  const [value, setValue] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    const quantity = Number(value);
    if (value.trim() === "" || !Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) return;
    await setStock.mutateAsync({ id: product.id, quantity });
    setValue("");
    toast.success(t("stockSaved"));
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
      <Image
        src={product.image.thumb_400}
        alt=""
        width={80}
        height={104}
        sizes="40px"
        className="bg-muted size-10 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <Link href={`/admin/products/${product.id}`} className="line-clamp-1 font-medium hover:underline">
          {product.name}
        </Link>
        <span className={cn("text-xs font-medium", product.stock_quantity === 0 ? "text-destructive" : "text-warning-foreground")}>
          {product.stock_quantity === 0 ? t("soldOut") : t("left", { count: product.stock_quantity })}
        </span>
      </div>
      <form onSubmit={save} className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100000}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={t("setStock", { name: product.name })}
          className="border-field bg-background focus-visible:ring-ring/50 h-9 w-20 rounded-lg border px-2.5 text-sm tabular-nums outline-none focus-visible:ring-3"
        />
        <Button type="submit" size="sm" variant="outline" disabled={setStock.isPending || value.trim() === ""}>
          {t("save")}
        </Button>
      </form>
    </li>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div aria-busy aria-label={label} className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-[var(--radius-tile)]" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-[var(--radius-tile)]" />
    </div>
  );
}

/**
 * Агуулахын ажилтны нүүр: илгээх дараалал (хамгийн удсан нь эхэнд), нөөцийн анхааруулга (тэр дор
 * нь тохируулна), өөрийн сүүлийн үйлдлүүд. Орлого, хэрэглэгчийн мэдээлэл энд байхгүй.
 */
export function WarehouseDashboard() {
  const t = useTranslations("admin.warehouse");
  const common = useTranslations("admin.dashboard");
  const dates = useDates();
  const text = useAuditText();
  const name = useAuth((state) => state.user?.full_name)?.split(" ")[0];
  const { data: board, error, refetch, isFetching } = useFulfillmentBoard();

  return (
    <div>
      <AdminPageHeader
        title={t("title")}
        description={name ? `${t("greeting", { name })} ${t("description")}` : t("description")}
      />
      {error && !board ? (
        <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
      ) : !board ? (
        <Loading label={t("loading")} />
      ) : (
        <div className="space-y-4 md:space-y-6" aria-busy={isFetching}>
          <dl className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4" aria-label={t("keyFigures")}>
            <Stat label={t("toShip")} value={board.to_ship} />
            <Stat
              label={t("overdue")}
              value={<span className={board.overdue > 0 ? "text-destructive" : undefined}>{board.overdue}</span>}
              footer={<span className="text-muted-foreground text-xs">{t("overdueHint", { hours: board.sla_hours })}</span>}
            />
            <Stat
              label={t("shippedToday")}
              value={board.shipped_today}
              footer={<span className="text-muted-foreground text-xs">{t("deliveredToday", { count: board.delivered_today })}</span>}
            />
            <Stat
              label={t("avgShip")}
              value={board.avg_ship_hours === null ? "–" : common("hours", { value: board.avg_ship_hours })}
              footer={
                <span className="text-muted-foreground text-xs">
                  {board.avg_ship_hours === null ? t("noShipped") : t("avgShipHint")}
                </span>
              }
            />
          </dl>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-5">
            <Panel
              id="queue-heading"
              title={t("queueTitle")}
              description={t("queueDescription")}
              className="lg:col-span-3"
              action={
                <Link href="/admin/orders?status=paid" className="text-brand text-sm hover:underline">
                  {t("openQueue")}
                </Link>
              }
            >
              {board.queue.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <CheckCircle2 aria-hidden className="text-success size-4" /> {t("queueEmpty")}
                </p>
              ) : (
                <ul className="divide-border/70 -my-2 divide-y">
                  {board.queue.map((order) => (
                    <QueueRow key={order.number} order={order} />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              id="stock-heading"
              title={t("stockTitle")}
              description={t("stockDescription", { threshold: board.low_stock_threshold })}
              className="lg:col-span-2"
              action={
                <Link href="/admin/products?stock=low" className="text-brand inline-flex items-center gap-1 text-sm hover:underline">
                  {t("openInventory")} <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              }
            >
              {board.stock_alerts.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <CheckCircle2 aria-hidden className="text-success size-4" /> {t("stockEmpty")}
                </p>
              ) : (
                <ul className="divide-border/70 -my-2 divide-y">
                  {board.stock_alerts.map((product) => (
                    <StockRow key={product.id} product={product} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel id="mine-heading" title={t("myActivity")}>
            {board.my_activity.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noActivity")}</p>
            ) : (
              <ul className="divide-border/70 -my-2 divide-y">
                {board.my_activity.map((entry) => {
                  const { what, detail, object, href } = text(entry);
                  return (
                    <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm">
                      <span className="font-medium">{what}</span>
                      <Link href={href} className="text-brand hover:underline">
                        {object}
                      </Link>
                      {detail && <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{detail}</span>}
                      <span className="text-muted-foreground ml-auto text-xs">{dates.when(entry.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
