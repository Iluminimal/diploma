"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { CornerDownLeft, Package, Search, Shirt, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-store";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDebounced } from "@/lib/use-debounced";
import { fetchAdminCustomers, fetchAdminOrders, fetchAdminProducts } from "./admin-api";
import { ADMIN_LINKS } from "./admin-nav";

const MIN_QUERY = 2;
const PER_GROUP = 5;

/** ⌘K / Ctrl+K хаанаас ч, `/` бичих талбарт биш үед: хайлтыг нээнэ. */
export function useCommandPaletteHotkeys(toggle: () => void, open: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if (typing) return;
      event.preventDefault();
      open();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle, open]);
}

const ITEM =
  "data-[selected=true]:bg-muted flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none";
const HEADING = "[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium";

/**
 * Admin-ы глобал хайлт (⌘K): хэсэг рүү шилжих, захиалгын дугаар, барааны нэр, хэрэглэгчийн
 * нэр/имэйлээр шууд очих. Үр дүн нь одоо байгаа admin жагсаалтуудын `q` хайлтаас ирнэ (шинэ endpoint
 * байхгүй), 250 мс хүлээж, 2-оос дээш тэмдэгттэй үед л.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("admin.palette");
  const nav = useTranslations("admin.nav");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const term = useDebounced(query.trim(), 250);
  const role = useAuth((state) => state.user?.role);
  const isAdmin = role === "admin";
  // Хэсгүүд ба хэрэглэгчийн хайлт нь зөвхөн админых: агуулахын ажилтан эдгээрт хүрэхгүй (API 403).
  const sections = ADMIN_LINKS.filter((link) => (link.roles as readonly string[]).includes(role ?? ""));
  const searching = open && term.length >= MIN_QUERY;

  const orders = useQuery({
    queryKey: ["admin", "palette", "orders", term],
    queryFn: () => fetchAdminOrders({ q: term, status: "all", page: 1 }),
    enabled: searching,
    staleTime: 30_000,
  });
  const products = useQuery({
    queryKey: ["admin", "palette", "products", term],
    queryFn: () => fetchAdminProducts({ q: term, status: "all", stock: "all", sort: "newest", page: 1 }),
    enabled: searching,
    staleTime: 30_000,
  });
  const customers = useQuery({
    queryKey: ["admin", "palette", "customers", term],
    queryFn: () => fetchAdminCustomers({ q: term, status: "all", sort: "newest", page: 1 }),
    enabled: searching && isAdmin,
    staleTime: 30_000,
  });

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };
  const pending = searching && (orders.isFetching || products.isFetching || customers.isFetching);
  // cmdk `forceMount`-тай (сервер талын) үр дүнг "олдсонгүй"-д тооцдоггүй: өөрсдөө шийднэ.
  const found = searching && (orders.data?.items.length || products.data?.items.length || customers.data?.items.length);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent showCloseButton={false} className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("hint")}</DialogDescription>
        <Command label={t("title")} className={HEADING}>
          <div className="border-border/70 flex items-center gap-3 border-b px-4">
            <Search aria-hidden className="text-muted-foreground size-4 shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t("placeholder")}
              className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-[0.9375rem] outline-none"
            />
          </div>
          <Command.List className="max-h-[min(24rem,60dvh)] overflow-y-auto p-2">
            {!found && (
              <Command.Empty className="text-muted-foreground px-3 py-8 text-center text-sm">
                {pending ? t("searching") : query.trim().length < MIN_QUERY ? t("hint") : t("empty")}
              </Command.Empty>
            )}

            <Command.Group heading={t("go")}>
              {sections.map(({ key, href, icon: Icon }) => (
                <Command.Item key={key} value={nav(key)} keywords={[key]} onSelect={() => go(href)} className={ITEM}>
                  <Icon aria-hidden className="text-muted-foreground size-4" />
                  <span className="flex-1">{nav(key)}</span>
                  <CornerDownLeft aria-hidden className="text-muted-foreground size-3.5 opacity-0 data-[selected=true]:opacity-100" />
                </Command.Item>
              ))}
            </Command.Group>

            {searching && (orders.data?.items.length ?? 0) > 0 && (
              <Command.Group forceMount heading={t("orders")}>
                {orders.data?.items.slice(0, PER_GROUP).map((order) => (
                  <Command.Item key={order.number} forceMount value={`order-${order.number}`} onSelect={() => go(`/admin/orders/${order.number}`)} className={ITEM}>
                    <Package aria-hidden className="text-muted-foreground size-4" />
                    <span className="font-medium">{order.number}</span>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate">{order.customer_name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {searching && (products.data?.items.length ?? 0) > 0 && (
              <Command.Group forceMount heading={t("products")}>
                {products.data?.items.slice(0, PER_GROUP).map((product) => (
                  <Command.Item key={product.id} forceMount value={`product-${product.id}`} onSelect={() => go(`/admin/products/${product.id}`)} className={ITEM}>
                    <Shirt aria-hidden className="text-muted-foreground size-4" />
                    <span className="min-w-0 flex-1 truncate">{product.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">#{product.id}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {searching && (customers.data?.items.length ?? 0) > 0 && (
              <Command.Group forceMount heading={t("customers")}>
                {customers.data?.items.slice(0, PER_GROUP).map((customer) => (
                  <Command.Item key={customer.id} forceMount value={`customer-${customer.id}`} onSelect={() => go(`/admin/customers/${customer.id}`)} className={ITEM}>
                    <Users aria-hidden className="text-muted-foreground size-4" />
                    <span className="font-medium">{customer.full_name}</span>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate">{customer.email ?? customer.phone}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
