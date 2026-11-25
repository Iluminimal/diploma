"use client";

import { ArrowLeft, Download, Package } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Panel } from "@/components/admin/panel";
import { SearchForm } from "@/components/admin/search-form";
import { SegmentedNav } from "@/components/admin/segmented";
import { Field } from "@/components/forms/form-field";
import { Price } from "@/components/product/price";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { OrderDetail } from "@/features/orders/order-detail";
import { OrderTimeline } from "@/features/orders/order-events";
import { OrderProgress } from "@/features/orders/order-progress";
import type { Order } from "@/features/orders/orders-api";
import { ApiError } from "@/lib/api/errors";
import { useUserMessage } from "@/lib/api/use-user-message";
import { downloadOrdersCsv, type AdminOrder, type AdminOrderSummary, type OrderListParams } from "./admin-api";
import { useDates } from "./format";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { OrderActions } from "./order-actions";
import { OrderStatusDot } from "./order-status";
import { AdminPageHeader } from "./page-header";
import { useAuth } from "@/features/auth/auth-store";
import { useAddOrderNote, useAdminOrder, useAdminOrders } from "./use-admin";
import { QueryError } from "@/components/ui/query-error";

const DEFAULTS = { q: "", status: "all", page: 1 };
const TABS = [
  { status: "all", key: "tabAll" },
  { status: "pending", key: "tabPending" },
  { status: "paid", key: "tabPaid" },
  { status: "shipped", key: "tabShipped" },
  { status: "delivered", key: "tabDelivered" },
  { status: "cancelled", key: "tabCancelled" },
  { status: "refunded", key: "tabRefunded" },
] as const satisfies readonly { status: OrderListParams["status"]; key: string }[];

/** Админы тайлан: одоогийн шүүлтүүрт таарах захиалгыг CSV болгож татна (агуулахын ажилтанд харагдахгүй). */
function ExportOrders({ params }: { params: OrderListParams }) {
  const t = useTranslations("admin.orders");
  const userMessage = useUserMessage();
  const isAdmin = useAuth((state) => state.user?.role === "admin");
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return null;
  async function download() {
    setBusy(true);
    try {
      await downloadOrdersCsv(params);
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

export function OrdersTable({ params }: { params: OrderListParams }) {
  const t = useTranslations("admin.orders");
  const dates = useDates();
  const router = useRouter();
  const { data, isPending, error, refetch, isFetching } = useAdminOrders(params);
  const href = (change: Partial<OrderListParams>) => `/admin/orders${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;
  const counts = data?.status_counts;
  const countOf = (status: OrderListParams["status"]) =>
    counts === undefined ? undefined : status === "all" ? Object.values(counts).reduce((sum, n) => sum + n, 0) : (counts[status] ?? 0);

  const columns: Column<AdminOrderSummary>[] = [
    {
      id: "order",
      header: t("colOrder"),
      cell: (order) => (
        <Link href={`/admin/orders/${order.number}`} className="font-medium hover:underline">
          {order.number}
        </Link>
      ),
    },
    { id: "placed", header: t("colPlaced"), className: "whitespace-nowrap text-muted-foreground", cell: (order) => dates.when(order.created_at) },
    {
      id: "customer",
      header: t("colCustomer"),
      className: "max-w-60",
      cell: (order) => (
        <>
          <span className="block truncate">{order.customer_name}</span>
          <span className="text-muted-foreground block truncate text-xs">{order.customer_email}</span>
        </>
      ),
    },
    { id: "items", header: t("colItems"), align: "right", className: "tabular-nums", cell: (order) => order.item_count },
    { id: "status", header: t("colStatus"), cell: (order) => <OrderStatusDot status={order.status} /> },
    { id: "total", header: t("colTotal"), align: "right", cell: (order) => <Price cents={order.total_cents} currency={order.currency} className="font-medium" /> },
  ];

  return (
    <div>
      <AdminPageHeader title={t("title")} description={t("description")} actions={<ExportOrders params={params} />} />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedNav
            label={t("statusNav")}
            value={params.status}
            items={TABS.map(({ status, key }) => ({ key: status, label: t(key), count: countOf(status), href: href({ status }) }))}
          />
          <SearchForm
            label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            defaultValue={params.q}
            buttonLabel={t("search")}
            onSearch={(q) => router.replace(href({ q }))}
          />
        </div>

        {isPending ? (
          <Skeleton aria-busy aria-label={t("loading")} className="h-96 rounded-[var(--radius-tile)]" />
        ) : error || !data ? (
          <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
        ) : data.total === 0 ? (
          <EmptyState icon={Package} title={t("noneTitle")} description={t("noneHint")} bordered />
        ) : (
          <div className="space-y-4">
            <DataTable
              caption={t("caption")}
              columns={columns}
              rows={data.items}
              rowKey={(order) => order.number}
              busy={isFetching}
              renderCard={(order) => (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/admin/orders/${order.number}`} className="font-medium hover:underline">
                      {order.number}
                    </Link>
                    <Price cents={order.total_cents} currency={order.currency} className="font-medium" />
                  </div>
                  <p className="truncate">{order.customer_name}</p>
                  <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                    <span>
                      {dates.when(order.created_at)} · {t("colItems")} {order.item_count}
                    </span>
                    <OrderStatusDot status={order.status} />
                  </div>
                </div>
              )}
            />
            <ListPagination label={t("pages")} page={data.page} pages={data.pages} total={data.total} hrefFor={(page) => href({ page })} />
          </div>
        )}
      </div>
    </div>
  );
}

function AddNote({ number }: { number: string }) {
  const t = useTranslations("admin.orders");
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
          toast.success(t("noteAdded"));
        },
      },
    );
  };
  return (
    <form onSubmit={submit} className="border-border/70 space-y-2 border-t pt-4">
      <Field id="order-note" label={t("addNote")} hint={t("noteHint")}>
        <Textarea id="order-note" aria-describedby="order-note-hint" maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" disabled={add.isPending || !text.trim()}>
        {add.isPending ? t("adding") : t("addNoteButton")}
      </Button>
    </form>
  );
}

/** "Нэр ... утга" мөрүүд (iOS Settings-ийн grouped list): мөр бүр нимгэн зураасаар тусгаарлагдана. */
function Rows({ children }: { children: ReactNode }) {
  return <dl className="divide-border/70 -my-2.5 divide-y text-sm">{children}</dl>;
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function Fulfilment({ order }: { order: AdminOrder }) {
  const t = useTranslations("admin.orders");
  const dates = useDates();
  if (!order.shipped_at && !order.tracking_number) return null;
  return (
    <Panel id="fulfilment-heading" title={t("shipment")}>
      <Rows>
        {order.carrier && <Row label={t("carrier")}>{order.carrier}</Row>}
        {order.tracking_number && (
          <Row label={t("tracking")}>
            <span className="font-mono text-xs break-all">{order.tracking_number}</span>
          </Row>
        )}
        {order.shipped_at && <Row label={t("shipped")}>{dates.when(order.shipped_at)}</Row>}
        {order.delivered_at && <Row label={t("delivered")}>{dates.when(order.delivered_at)}</Row>}
      </Rows>
    </Panel>
  );
}

export function AdminOrderView({ number }: { number: string }) {
  const t = useTranslations("admin.orders");
  // Төлбөрийн төлөв, үйлчилгээ үзүүлэгчийн нэрийг орчуулна; мэдэгдэхгүй утга түүхий хэвээр.
  const label = t as unknown as ((key: string) => string) & { has: (key: string) => boolean };
  const word = (group: "paymentStatus" | "provider", value: string) => (label.has(`${group}.${value}`) ? label(`${group}.${value}`) : value);
  const userMessage = useUserMessage();
  const dates = useDates();
  const role = useAuth((state) => state.user?.role);
  const { data: order, error } = useAdminOrder(number);
  const back = (
    <Link href="/admin/orders" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
      <ArrowLeft aria-hidden className="size-4" /> {t("allOrders")}
    </Link>
  );
  return (
    <div>
      <AdminPageHeader
        title={t("orderTitle", { number })}
        back={back}
        description={order && <OrderStatusDot status={order.status} />}
        actions={order && <OrderActions order={order} />}
      />
      {error ? (
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? t("noSuch") : userMessage(error)}
        </p>
      ) : order ? (
        <div className="space-y-4 md:space-y-6">
          <Panel id="progress-heading" bodyClassName="sm:p-6">
            <OrderProgress order={order} />
          </Panel>
          <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4 md:space-y-6">
              <div className="admin-surface p-5 sm:p-6">
                {/* Үйлчлүүлэгчид юу харагдах: тэдний харагдацад дотоод тэмдэглэл байхгүй. */}
                <OrderDetail order={{ ...order, events: order.events.filter((event) => event.type !== "note") as Order["events"] }} />
              </div>
              <Panel id="history-heading" title={t("history")}>
                <div className="space-y-4">
                  <OrderTimeline events={order.events} currency={order.currency} newestFirst />
                  {role === "admin" && <AddNote number={order.number} />}
                </div>
              </Panel>
            </div>
            <div className="space-y-4 md:space-y-6 lg:sticky lg:top-20">
              <Fulfilment order={order} />
              <Panel id="payment-heading" title={t("customerPayment")}>
                <Rows>
                  <Row label={t("customer")}>
                    <Link href={`/admin/customers/${order.user_id}`} className="hover:underline">
                      {order.contact_email}
                    </Link>{" "}
                    <span className="text-muted-foreground">{t("account", { id: order.user_id })}</span>
                  </Row>
                  {order.payment ? (
                    <>
                      <Row label={t("payment")}>{t("paymentVia", { status: word("paymentStatus", order.payment.status), provider: word("provider", order.payment.provider) })}</Row>
                      <Row label={t("reference")}>
                        <span className="font-mono text-xs break-all">{order.payment.provider_payment_id}</span>
                      </Row>
                      {order.payment.last_error && <Row label={t("lastError")}>{order.payment.last_error}</Row>}
                      {order.payment.refund_id && (
                        <Row label={t("refund")}>
                          <span className="font-mono text-xs break-all">{order.payment.refund_id}</span>
                        </Row>
                      )}
                    </>
                  ) : (
                    <Row label={t("payment")}>{t("noPayment")}</Row>
                  )}
                  {order.status === "cancelled" && (
                    <Row label={t("cancelled")}>
                      {order.cancelled_at ? dates.when(order.cancelled_at) : ""}
                      {order.cancel_reason ? ` · ${order.cancel_reason}` : ""}
                    </Row>
                  )}
                </Rows>
              </Panel>
            </div>
          </div>
        </div>
      ) : (
        <Skeleton aria-busy aria-label={t("loadingOrder")} className="h-72 rounded-[var(--radius-tile)]" />
      )}
    </div>
  );
}
