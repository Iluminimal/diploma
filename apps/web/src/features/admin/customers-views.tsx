"use client";

import { ArrowLeft, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/form-field";
import { Price } from "@/components/product/price";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { UserAvatar } from "@/components/layout/user-avatar";
import { StatusBadge } from "@/features/orders/status-badge";
import { ApiError, userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminCustomer, CustomerListParams } from "./admin-api";
import { day, when } from "./format";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { AdminPageHeader } from "./page-header";
import { useAdminCustomer, useAdminCustomers, useSetCustomerActive } from "./use-admin";

const DEFAULTS = { q: "", status: "all", sort: "newest", page: 1 };
const STATUS_LABELS: Record<CustomerListParams["status"], string> = {
  all: "All customers",
  active: "Active",
  inactive: "Suspended",
};
const SORT_LABELS: Record<CustomerListParams["sort"], string> = {
  newest: "Newest first",
  spent: "Top spenders",
  orders: "Most orders",
  name: "Name, A to Z",
};

const PROVIDER_LABELS: Record<string, string> = { google: "Google" };

function StatusPill({ active }: { active: boolean }) {
  return active ? <Badge variant="secondary">Active</Badge> : <Badge variant="destructive">Suspended</Badge>;
}

export function CustomersTable({ params }: { params: CustomerListParams }) {
  const router = useRouter();
  const { data, isPending, error, refetch, isFetching } = useAdminCustomers(params);
  const href = (change: Partial<CustomerListParams>) =>
    `/admin/customers${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.replace(href({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim() }));
  };

  return (
    <div>
      <AdminPageHeader title="Customers" description="Everyone who has an account, and what they have bought." />
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <form onSubmit={search} role="search" aria-label="Search customers" className="flex flex-1 gap-2 sm:max-w-md">
            <Input
              key={params.q}
              name="q"
              type="search"
              defaultValue={params.q}
              placeholder="Name or email"
              aria-label="Name or email"
              className="h-11 rounded-xl"
            />
            <Button type="submit" variant="outline" className="h-11 rounded-full px-4">
              <Search aria-hidden /> Search
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Show"
              className={cn(selectClass, "w-auto")}
              value={params.status}
              onChange={(event) => router.replace(href({ status: event.target.value as CustomerListParams["status"] }))}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort by"
              className={cn(selectClass, "w-auto")}
              value={params.sort}
              onChange={(event) => router.replace(href({ sort: event.target.value as CustomerListParams["sort"] }))}
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isPending ? (
          <Skeleton aria-busy aria-label="Loading customers" className="h-80 rounded-2xl" />
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
              <Users aria-hidden className="text-muted-foreground size-6" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-medium">No customers found</h2>
              <p className="text-muted-foreground text-sm">Try another search.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4" aria-busy={isFetching}>
            <div className="border-border bg-background rounded-2xl border">
              <Table>
                <TableCaption>Customers</TableCaption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Customer</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead>Last order</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((customer) => (
                    <CustomerRow key={customer.id} customer={customer} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <ListPagination label="Customers pages" page={data.page} pages={data.pages} total={data.total} hrefFor={(page) => href({ page })} />
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerRow({ customer }: { customer: AdminCustomer }) {
  return (
    <TableRow>
      <TableCell className="max-w-64">
        <Link href={`/admin/customers/${customer.id}`} className="block truncate font-medium hover:underline">
          {customer.full_name}
        </Link>
        <span className="text-muted-foreground block truncate text-xs">{customer.email ?? customer.phone}</span>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">{day(customer.created_at)}</TableCell>
      <TableCell className="text-right tabular-nums">{customer.orders_count}</TableCell>
      <TableCell className="text-right">
        <Price cents={customer.total_spent_cents} className="font-medium" />
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {customer.last_order_at ? day(customer.last_order_at) : "Never"}
      </TableCell>
      <TableCell>
        <StatusPill active={customer.is_active} />
      </TableCell>
    </TableRow>
  );
}

export function CustomerView({ id }: { id: number }) {
  const { data: customer, error } = useAdminCustomer(id);
  const setActive = useSetCustomerActive();
  const [confirming, setConfirming] = useState(false);

  const back = (
    <Link href="/admin/customers" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
      <ArrowLeft aria-hidden className="size-4" /> All customers
    </Link>
  );

  if (error) {
    return (
      <div>
        <AdminPageHeader title="Customer" back={back} />
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? "There is no such customer." : userMessage(error)}
        </p>
      </div>
    );
  }
  if (!customer) {
    return (
      <div>
        <AdminPageHeader title="Customer" back={back} />
        <Skeleton aria-busy aria-label="Loading the customer" className="h-64 rounded-2xl" />
      </div>
    );
  }

  const methods = [
    ...(customer.has_password ? ["Email and password"] : []),
    ...customer.providers.map((provider) => PROVIDER_LABELS[provider] ?? provider),
  ];

  return (
    <div>
      <AdminPageHeader
        title={customer.full_name}
        back={back}
        description={customer.email ?? customer.phone ?? undefined}
        actions={
          customer.is_active ? (
            <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setConfirming(true)}>
              Suspend account
            </Button>
          ) : (
            <Button
              className="h-10 rounded-full px-4"
              disabled={setActive.isPending}
              onClick={() =>
                setActive.mutate({ id: customer.id, active: true }, { onSuccess: () => toast.success("Account reinstated.") })
              }
            >
              Reinstate account
            </Button>
          )
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <section aria-labelledby="account-heading" className="bg-background border-border space-y-4 rounded-2xl border p-4 text-sm sm:p-5">
            <div className="flex items-center gap-3">
              <UserAvatar user={{ full_name: customer.full_name, avatar_url: customer.avatar_url }} size={44} />
              <div className="min-w-0">
                <h2 id="account-heading" className="truncate font-semibold">
                  Account
                </h2>
                <StatusPill active={customer.is_active} />
              </div>
            </div>
            <dl className="grid gap-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Joined</dt>
                <dd>{day(customer.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Signs in with</dt>
                <dd className="text-right">{methods.length ? methods.join(", ") : "Nothing (no way to sign in)"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Orders</dt>
                <dd className="tabular-nums">{customer.orders_count}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Spent</dt>
                <dd>
                  <Price cents={customer.total_spent_cents} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Last order</dt>
                <dd>{customer.last_order_at ? day(customer.last_order_at) : "Never"}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section aria-labelledby="orders-heading" className="bg-background border-border rounded-2xl border p-4 sm:p-5">
          <h2 id="orders-heading" className="mb-4 font-semibold">
            Recent orders
          </h2>
          {customer.recent_orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No orders yet.</p>
          ) : (
            <ul className="divide-border -my-2 divide-y">
              {customer.recent_orders.map((order) => (
                <li key={order.number} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                  <Link href={`/admin/orders/${order.number}`} className="font-medium hover:underline">
                    {order.number}
                  </Link>
                  <span className="text-muted-foreground flex-1">{when(order.created_at)}</span>
                  <StatusBadge status={order.status} />
                  <Price cents={order.total_cents} currency={order.currency} className="w-20 text-right font-medium" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend this account?</DialogTitle>
            <DialogDescription>
              {customer.full_name} is signed out everywhere and cannot sign in again until you reinstate the account. Their
              orders and reviews stay as they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep it active
            </Button>
            <Button
              variant="destructive"
              disabled={setActive.isPending}
              onClick={() =>
                setActive.mutate(
                  { id: customer.id, active: false },
                  {
                    onSuccess: () => {
                      toast.success("Account suspended.");
                      setConfirming(false);
                    },
                  },
                )
              }
            >
              Suspend account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
