"use client";

import { ArrowLeft, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/admin/data-table";
import { NativeSelect } from "@/components/ui/native-select";
import { Panel } from "@/components/admin/panel";
import { SearchForm } from "@/components/admin/search-form";
import { Stat } from "@/components/admin/stat";
import { StatusDot } from "@/components/admin/status-dot";
import { UserAvatar } from "@/components/layout/user-avatar";
import { Price } from "@/components/product/price";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { useUserMessage } from "@/lib/api/use-user-message";
import type { AdminCustomer, CustomerListParams } from "./admin-api";
import { useDates } from "./format";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { OrderStatusDot } from "./order-status";
import { AdminPageHeader } from "./page-header";
import { useAdminCustomer, useAdminCustomers, useSetCustomerActive } from "./use-admin";
import { QueryError } from "@/components/ui/query-error";

const DEFAULTS = { q: "", status: "all", sort: "newest", page: 1 };
const STATUS_KEYS = {
  all: "statusAll",
  active: "statusActive",
  inactive: "statusInactive",
} as const satisfies Record<CustomerListParams["status"], string>;
const SORT_KEYS = {
  newest: "sortNewest",
  spent: "sortSpent",
  orders: "sortOrders",
  name: "sortName",
} as const satisfies Record<CustomerListParams["sort"], string>;

const PROVIDER_LABELS: Record<string, string> = { google: "Google" };

function StatusPill({ active }: { active: boolean }) {
  const t = useTranslations("admin.customers");
  return active ? <StatusDot tone="success">{t("active")}</StatusDot> : <StatusDot tone="danger">{t("suspended")}</StatusDot>;
}

export function CustomersTable({ params }: { params: CustomerListParams }) {
  const t = useTranslations("admin.customers");
  const { day } = useDates();
  const router = useRouter();
  const { data, isPending, error, refetch, isFetching } = useAdminCustomers(params);
  const href = (change: Partial<CustomerListParams>) => `/admin/customers${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;
  const sortHref = (sort: string) => href({ sort: sort as CustomerListParams["sort"] });

  const columns: Column<AdminCustomer>[] = [
    {
      id: "customer",
      header: t("colCustomer"),
      className: "max-w-64",
      sort: { asc: "name" },
      cell: (customer) => (
        <div className="flex items-center gap-3">
          <UserAvatar user={{ full_name: customer.full_name, avatar_url: customer.avatar_url }} size={36} />
          <div className="min-w-0">
            <Link href={`/admin/customers/${customer.id}`} className="block truncate font-medium hover:underline">
              {customer.full_name}
            </Link>
            <span className="text-muted-foreground block truncate text-xs">{customer.email ?? customer.phone}</span>
          </div>
        </div>
      ),
    },
    { id: "joined", header: t("colJoined"), sort: { desc: "newest" }, className: "text-muted-foreground whitespace-nowrap", cell: (customer) => day(customer.created_at) },
    { id: "orders", header: t("colOrders"), align: "right", sort: { desc: "orders" }, className: "tabular-nums", cell: (customer) => customer.orders_count },
    { id: "spent", header: t("colSpent"), align: "right", sort: { desc: "spent" }, cell: (customer) => <Price cents={customer.total_spent_cents} className="font-medium" /> },
    {
      id: "last",
      header: t("colLastOrder"),
      className: "text-muted-foreground whitespace-nowrap",
      cell: (customer) => (customer.last_order_at ? day(customer.last_order_at) : t("never")),
    },
    { id: "status", header: t("colStatus"), cell: (customer) => <StatusPill active={customer.is_active} /> },
  ];

  return (
    <div>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchForm
            label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            defaultValue={params.q}
            buttonLabel={t("search")}
            onSearch={(q) => router.replace(href({ q }))}
          />
          <div className="flex flex-wrap gap-2">
            <NativeSelect variant="pill" aria-label={t("show")} value={params.status} onChange={(event) => router.replace(href({ status: event.target.value as CustomerListParams["status"] }))}>
              {Object.entries(STATUS_KEYS).map(([value, key]) => (
                <option key={value} value={value}>
                  {t(key)}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect variant="pill" aria-label={t("sortBy")} value={params.sort} onChange={(event) => router.replace(href({ sort: event.target.value as CustomerListParams["sort"] }))}>
              {Object.entries(SORT_KEYS).map(([value, key]) => (
                <option key={value} value={value}>
                  {t(key)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {isPending ? (
          <Skeleton aria-busy aria-label={t("loading")} className="h-96 rounded-[var(--radius-tile)]" />
        ) : error || !data ? (
          <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
        ) : data.total === 0 ? (
          <EmptyState icon={Users} title={t("noneTitle")} description={t("noneHint")} bordered />
        ) : (
          <div className="space-y-4">
            <DataTable
              caption={t("caption")}
              columns={columns}
              rows={data.items}
              rowKey={(customer) => customer.id}
              sort={params.sort}
              sortHref={sortHref}
              busy={isFetching}
              renderCard={(customer) => (
                <div className="flex items-start gap-3 text-sm">
                  <UserAvatar user={{ full_name: customer.full_name, avatar_url: customer.avatar_url }} size={40} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link href={`/admin/customers/${customer.id}`} className="block truncate font-medium hover:underline">
                      {customer.full_name}
                    </Link>
                    <span className="text-muted-foreground block truncate text-xs">{customer.email ?? customer.phone}</span>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
                      <span>
                        {t("colOrders")} {customer.orders_count}
                      </span>
                      <Price cents={customer.total_spent_cents} className="text-foreground font-medium" />
                    </div>
                    <StatusPill active={customer.is_active} />
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

export function CustomerView({ id }: { id: number }) {
  const t = useTranslations("admin.customers");
  const userMessage = useUserMessage();
  const { day, when } = useDates();
  const { data: customer, error } = useAdminCustomer(id);
  const setActive = useSetCustomerActive();
  const [confirming, setConfirming] = useState(false);

  const back = (
    <Link href="/admin/customers" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
      <ArrowLeft aria-hidden className="size-4" /> {t("allCustomers")}
    </Link>
  );

  if (error) {
    return (
      <div>
        <AdminPageHeader title={t("customer")} back={back} />
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? t("noSuch") : userMessage(error)}
        </p>
      </div>
    );
  }
  if (!customer) {
    return (
      <div>
        <AdminPageHeader title={t("customer")} back={back} />
        <Skeleton aria-busy aria-label={t("loadingOne")} className="h-72 rounded-[var(--radius-tile)]" />
      </div>
    );
  }

  const methods = [
    ...(customer.has_password ? [t("emailPassword")] : []),
    ...customer.providers.map((provider) => PROVIDER_LABELS[provider] ?? provider),
  ];
  const average = customer.orders_count > 0 ? Math.round(customer.total_spent_cents / customer.orders_count) : 0;

  return (
    <div>
      <AdminPageHeader
        title={customer.full_name}
        back={back}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{customer.email ?? customer.phone}</span>
            <StatusPill active={customer.is_active} />
          </span>
        }
        actions={
          customer.is_active ? (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              {t("suspendAccount")}
            </Button>
          ) : (
            <Button
              disabled={setActive.isPending}
              onClick={() => setActive.mutate({ id: customer.id, active: true }, { onSuccess: () => toast.success(t("reinstated")) })}
            >
              {t("reinstate")}
            </Button>
          )
        }
      />

      <dl className="mb-4 grid grid-cols-2 gap-3 md:mb-6 md:gap-4 lg:grid-cols-4">
        <Stat label={t("orders")} value={customer.orders_count} />
        <Stat label={t("spent")} value={<Price cents={customer.total_spent_cents} />} />
        <Stat label={t("averageOrder")} value={<Price cents={average} />} />
        <Stat label={t("lastOrder")} value={<span className="text-xl">{customer.last_order_at ? day(customer.last_order_at) : t("never")}</span>} />
      </dl>

      <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Panel id="account-heading" title={t("account")}>
          <div className="mb-4 flex items-center gap-3">
            <UserAvatar user={{ full_name: customer.full_name, avatar_url: customer.avatar_url }} size={48} />
            <StatusPill active={customer.is_active} />
          </div>
          <dl className="divide-border/70 -my-2.5 divide-y text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted-foreground">{t("joined")}</dt>
              <dd>{day(customer.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted-foreground">{t("signsInWith")}</dt>
              <dd className="text-right">{methods.length ? methods.join(", ") : t("nothing")}</dd>
            </div>
          </dl>
        </Panel>

        <Panel id="orders-heading" title={t("recentOrders")}>
          {customer.recent_orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noOrders")}</p>
          ) : (
            <ul className="divide-border/70 -my-2 divide-y">
              {customer.recent_orders.map((order) => (
                <li key={order.number} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                  <Link href={`/admin/orders/${order.number}`} className="font-medium hover:underline">
                    {order.number}
                  </Link>
                  <span className="text-muted-foreground flex-1">{when(order.created_at)}</span>
                  <OrderStatusDot status={order.status} />
                  <Price cents={order.total_cents} currency={order.currency} className="w-20 text-right font-medium" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("suspendTitle")}</DialogTitle>
            <DialogDescription>{t("suspendDesc", { name: customer.full_name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {t("keepActive")}
            </Button>
            <Button
              variant="destructive"
              disabled={setActive.isPending}
              onClick={() =>
                setActive.mutate(
                  { id: customer.id, active: false },
                  {
                    onSuccess: () => {
                      toast.success(t("suspendedToast"));
                      setConfirming(false);
                    },
                  },
                )
              }
            >
              {t("suspendAccount")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
