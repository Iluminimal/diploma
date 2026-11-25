"use client";

import { Eye, Pencil, Plus, RotateCcw, Shirt } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { BulkBar } from "@/components/admin/bulk-bar";
import { DataTable, useSelection, type Column } from "@/components/admin/data-table";
import { NativeSelect } from "@/components/ui/native-select";
import { SearchForm } from "@/components/admin/search-form";
import { SegmentedControl } from "@/components/admin/segmented";
import { StatusDot } from "@/components/admin/status-dot";
import { Price } from "@/components/product/price";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useVocab } from "@/i18n/use-vocab";
import { cn } from "@/lib/utils";
import type { AdminProduct, ProductListParams } from "./admin-api";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { AdminPageHeader } from "./page-header";
import { useIsWarehouse } from "@/features/auth/use-role";
import { useAdminProducts, useBulkSetProductActive, useSetProductActive } from "./use-admin";
import { QueryError } from "@/components/ui/query-error";

const DEFAULTS = { q: "", status: "all", stock: "all", sort: "newest", page: 1 };
const SORT_KEYS = {
  newest: "sortNewest",
  price_asc: "sortPriceAsc",
  price_desc: "sortPriceDesc",
  stock_asc: "sortStockAsc",
} as const satisfies Record<ProductListParams["sort"], string>;
const STATUS_KEYS = {
  all: "statusAll",
  active: "statusActive",
  inactive: "statusInactive",
} as const satisfies Record<ProductListParams["status"], string>;

type ViewMode = "table" | "grid";
const VIEW_STORAGE = "admin.products.view";

const viewListeners = new Set<() => void>();
let memoryView: ViewMode | null = null;

function readView(): ViewMode {
  if (memoryView) return memoryView;
  try {
    return localStorage.getItem(VIEW_STORAGE) === "grid" ? "grid" : "table";
  } catch {
    return "table"; // Хувийн цонх, хаагдсан storage.
  }
}

/**
 * Хүснэгт/зураг харагдацын сонголтыг энэ хөтөч дээр санана (хувийн тохиргоо). Server болон hydration
 * үед "table": `useSyncExternalStore` хоёр хувилбарыг зөв тааруулна.
 */
function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const mode = useSyncExternalStore(
    (onChange) => {
      viewListeners.add(onChange);
      window.addEventListener("storage", onChange);
      return () => {
        viewListeners.delete(onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    readView,
    () => "table" as ViewMode,
  );
  return [
    mode,
    (next) => {
      memoryView = next;
      try {
        localStorage.setItem(VIEW_STORAGE, next);
      } catch {
        // Хадгалж чадаагүй ч энэ хуудсанд харагдац солигдсон хэвээр.
      }
      viewListeners.forEach((listener) => listener());
    },
  ];
}

function Thumb({ product, className }: { product: AdminProduct; className?: string }) {
  return (
    <Image
      src={product.image.thumb_400}
      alt=""
      width={400}
      height={533}
      sizes="56px"
      className={cn("bg-muted rounded-lg object-cover", !product.is_active && "grayscale", className)}
    />
  );
}

export function ProductsTable({ params }: { params: ProductListParams }) {
  const t = useTranslations("admin.products");
  const vocab = useVocab();
  const router = useRouter();
  const [view, setView] = useViewMode();
  const { data, isPending, error, refetch, isFetching } = useAdminProducts(params);
  const setActive = useSetProductActive();
  const bulk = useBulkSetProductActive();
  // Нэмэх, засах, хасах, олноор сонгох нь агуулахын ажилтных; админ зөвхөн харна.
  const canEdit = useIsWarehouse();
  const selection = useSelection<number>();
  const [withdrawing, setWithdrawing] = useState<AdminProduct[] | null>(null);

  // Өөр хуудас, шүүлтүүр руу шилжихэд сонголт хамт үлдэхгүй: харагдахгүй мөрөнд үйлдэл хийчихгүй.
  const filterKey = JSON.stringify(params);
  const { clear } = selection;
  useEffect(() => clear(), [filterKey, clear]);

  const href = (change: Partial<ProductListParams>) => `/admin/products${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;
  const sortHref = (sort: string) => href({ sort: sort as ProductListParams["sort"] });
  const items = data?.items ?? [];
  const chosen = items.filter((product) => selection.selected.has(product.id));
  const anyActive = chosen.some((product) => product.is_active);
  const anyInactive = chosen.some((product) => !product.is_active);

  const restore = (product: AdminProduct) =>
    setActive.mutate({ id: product.id, active: true }, { onSuccess: () => toast.success(t("backOnSale")) });

  const runBulk = (active: boolean) => {
    const ids = chosen.filter((product) => product.is_active !== active).map((product) => product.id);
    bulk.mutate(
      { ids, active },
      {
        onSuccess: ({ done, failed }) => {
          if (failed > 0) toast.error(t("bulkPartial", { done, failed }));
          else toast.success(t(active ? "bulkRestored" : "bulkWithdrawn", { count: done }));
          selection.clear();
        },
      },
    );
  };

  const confirmWithdraw = () => {
    if (!withdrawing) return;
    if (withdrawing.length === 1) {
      const [only] = withdrawing;
      setActive.mutate({ id: only!.id, active: false }, { onSuccess: () => toast.success(t("withdrawnToast")) });
    } else {
      runBulk(false);
    }
    setWithdrawing(null);
  };

  const status = (product: AdminProduct) =>
    product.is_active ? <StatusDot tone="success">{t("onSale")}</StatusDot> : <StatusDot tone="neutral">{t("withdrawn")}</StatusDot>;

  const rowActions = (product: AdminProduct) => (
    <div className="flex justify-end gap-2">
      <Button asChild variant="outline" className="h-8 rounded-full px-3">
        <Link href={`/admin/products/${product.id}`} aria-label={t(canEdit ? "editLabel" : "viewProduct", { name: product.name })}>
          {canEdit ? <Pencil aria-hidden /> : <Eye aria-hidden />} {t(canEdit ? "edit" : "view")}
        </Link>
      </Button>
      {!canEdit ? null : product.is_active ? (
        <Button variant="outline" className="h-8 rounded-full px-3" aria-label={t("withdrawLabel", { name: product.name })} onClick={() => setWithdrawing([product])}>
          {t("withdraw")}
        </Button>
      ) : (
        <Button variant="outline" className="h-8 rounded-full px-3" aria-label={t("restoreLabel", { name: product.name })} disabled={setActive.isPending} onClick={() => restore(product)}>
          <RotateCcw aria-hidden /> {t("restore")}
        </Button>
      )}
    </div>
  );

  const columns: Column<AdminProduct>[] = [
    { id: "photo", header: t("colPhoto"), className: "w-16", cell: (product) => <Thumb product={product} className="h-14 w-11" /> },
    {
      id: "name",
      header: t("colName"),
      className: "max-w-64 min-w-40",
      cell: (product) => (
        <>
          <Link href={`/admin/products/${product.id}`} className="line-clamp-2 font-medium hover:underline">
            {product.name}
          </Link>
          <span className="text-muted-foreground text-xs">#{product.id}</span>
        </>
      ),
    },
    { id: "category", header: t("colCategory"), className: "text-muted-foreground whitespace-nowrap", cell: (product) => vocab.category(product.article_type) },
    {
      id: "price",
      header: t("colPrice"),
      align: "right",
      sort: { asc: "price_asc", desc: "price_desc" },
      cell: (product) => <Price cents={product.price_cents} currency={product.currency} />,
    },
    {
      id: "stock",
      header: t("colStock"),
      align: "right",
      sort: { asc: "stock_asc" },
      className: "tabular-nums",
      cell: (product) => <span className={cn(product.stock_quantity === 0 && "text-destructive font-medium")}>{product.stock_quantity}</span>,
    },
    { id: "status", header: t("colStatus"), cell: status },
    { id: "actions", header: <span className="sr-only">{t("colActions")}</span>, align: "right", cell: rowActions },
  ];

  const selectionProps = {
    selected: selection.selected,
    onToggle: selection.toggle,
    onToggleAll: (on: boolean) =>
      selection.setAll(
        items.map((product) => product.id),
        on,
      ),
    label: (product: AdminProduct) => t("selectRow", { name: product.name }),
    selectAllLabel: t("selectAll"),
  };

  return (
    <div>
      <AdminPageHeader
        title={t("title")}
        description={t(canEdit ? "description" : "descriptionReadOnly")}
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/admin/products/new">
                <Plus aria-hidden /> {t("newProduct")}
              </Link>
            </Button>
          )
        }
      />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchForm
            label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            defaultValue={params.q}
            buttonLabel={t("search")}
            onSearch={(q) => router.replace(href({ q }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect variant="pill" aria-label={t("show")} value={params.status} onChange={(event) => router.replace(href({ status: event.target.value as ProductListParams["status"] }))}>
              {Object.entries(STATUS_KEYS).map(([value, key]) => (
                <option key={value} value={value}>
                  {t(key)}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect variant="pill" aria-label={t("stockFilter")} value={params.stock} onChange={(event) => router.replace(href({ stock: event.target.value as ProductListParams["stock"] }))}>
              <option value="all">{t("stockAll")}</option>
              <option value="low">{t("stockLow")}</option>
              <option value="out">{t("stockOut")}</option>
            </NativeSelect>
            <NativeSelect variant="pill" aria-label={t("sortBy")} value={params.sort} onChange={(event) => router.replace(href({ sort: event.target.value as ProductListParams["sort"] }))}>
              {Object.entries(SORT_KEYS).map(([value, key]) => (
                <option key={value} value={value}>
                  {t(key)}
                </option>
              ))}
            </NativeSelect>
            <SegmentedControl
              label={t("viewLabel")}
              value={view}
              onChange={setView}
              items={[
                { key: "table", label: t("viewTable") },
                { key: "grid", label: t("viewGrid") },
              ]}
            />
          </div>
        </div>

        {isPending ? (
          <Skeleton aria-busy aria-label={t("loading")} className="h-96 rounded-[var(--radius-tile)]" />
        ) : error || !data ? (
          <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
        ) : data.total === 0 ? (
          <EmptyState icon={Shirt} title={t("noneTitle")} description={t("noneHint")} bordered />
        ) : (
          <div className="space-y-4">
            {view === "table" ? (
              <DataTable
                caption={t("caption")}
                columns={columns}
                rows={items}
                rowKey={(product) => product.id}
                sort={params.sort}
                sortHref={sortHref}
                selection={canEdit ? selectionProps : undefined}
                busy={isFetching}
                renderCard={(product) => (
                  <div className="flex gap-3 text-sm">
                    <Thumb product={product} className="h-20 w-16 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Link href={`/admin/products/${product.id}`} className="line-clamp-2 font-medium hover:underline">
                        {product.name}
                      </Link>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
                        <Price cents={product.price_cents} currency={product.currency} className="text-foreground font-medium" />
                        <span>{t("stockCount", { count: product.stock_quantity })}</span>
                      </div>
                      {status(product)}
                      <div className="pt-1">{rowActions(product)}</div>
                    </div>
                  </div>
                )}
              />
            ) : (
              <ul aria-label={t("caption")} aria-busy={isFetching} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {items.map((product) => {
                  const checked = selection.selected.has(product.id);
                  return (
                    <li key={product.id} className={cn("admin-surface group relative overflow-hidden transition-shadow", checked && "ring-2 ring-[var(--brand)]")}>
                      <Link href={`/admin/products/${product.id}`} className="block" aria-label={t("editLabel", { name: product.name })}>
                        <div className="bg-muted aspect-[3/4] overflow-hidden">
                          <Image
                            src={product.image.thumb_800}
                            alt=""
                            width={800}
                            height={1067}
                            sizes="(min-width: 1280px) 15vw, (min-width: 640px) 22vw, 45vw"
                            className={cn("size-full object-cover mix-blend-multiply transition-transform duration-500 group-hover:scale-[1.03] dark:mix-blend-normal", !product.is_active && "grayscale")}
                          />
                        </div>
                      </Link>
                      {canEdit && (
                        <Checkbox
                          aria-label={t("selectRow", { name: product.name })}
                          checked={checked}
                          onCheckedChange={() => selection.toggle(product.id)}
                          className="bg-background/90 absolute top-2.5 left-2.5"
                        />
                      )}
                      <div className="space-y-1 p-3 text-sm">
                        <p className="line-clamp-2 min-h-[2.5rem] font-medium">{product.name}</p>
                        <div className="flex items-center justify-between gap-2">
                          <Price cents={product.price_cents} currency={product.currency} className="font-medium" />
                          {status(product)}
                        </div>
                        <p className={cn("text-xs", product.stock_quantity === 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
                          {product.stock_quantity === 0 ? t("outOfStock") : t("stockCount", { count: product.stock_quantity })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <ListPagination label={t("pages")} page={data.page} pages={data.pages} total={data.total} hrefFor={(page) => href({ page })} />
          </div>
        )}
      </div>

      <BulkBar count={chosen.length} label={t("selectedCount", { count: chosen.length })} clearLabel={t("clearSelection")} onClear={selection.clear}>
        {anyActive && (
          <Button size="sm" variant="destructive" disabled={bulk.isPending} onClick={() => setWithdrawing(chosen.filter((product) => product.is_active))}>
            {t("withdraw")}
          </Button>
        )}
        {anyInactive && (
          <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk(true)}>
            <RotateCcw aria-hidden /> {t("restore")}
          </Button>
        )}
      </BulkBar>

      <Dialog open={withdrawing !== null} onOpenChange={(open) => !open && setWithdrawing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{withdrawing && withdrawing.length > 1 ? t("bulkDialogTitle", { count: withdrawing.length }) : t("dialogTitle")}</DialogTitle>
            <DialogDescription>
              {withdrawing?.length === 1 ? `${withdrawing[0]!.name}. ` : ""}
              {withdrawing && withdrawing.length > 1 ? t("bulkDialogBody") : t("dialogBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawing(null)}>
              {t("keep")}
            </Button>
            <Button variant="destructive" disabled={setActive.isPending || bulk.isPending} onClick={confirmWithdraw}>
              {t("withdraw")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
