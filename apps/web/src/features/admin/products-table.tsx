"use client";

import { Pencil, Plus, RotateCcw, Search, Shirt } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { selectClass } from "@/components/form-field";
import { Price } from "@/components/price";
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
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminProduct, ProductListParams } from "./admin-api";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { useAdminProducts, useSetProductActive } from "./use-admin";
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULTS = { q: "", status: "all", sort: "newest", page: 1 };
const SORT_LABELS: Record<ProductListParams["sort"], string> = {
  newest: "Newest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  stock_asc: "Lowest stock first",
};
const STATUS_LABELS: Record<ProductListParams["status"], string> = {
  all: "All products",
  active: "On sale",
  inactive: "Withdrawn",
};

export function ProductsTable({ params }: { params: ProductListParams }) {
  const router = useRouter();
  const { data, isPending, error, refetch, isFetching } = useAdminProducts(params);
  const setActive = useSetProductActive();
  const [withdrawing, setWithdrawing] = useState<AdminProduct | null>(null);

  const href = (change: Partial<ProductListParams>) =>
    `/admin/products${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    router.replace(href({ q }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form onSubmit={search} role="search" aria-label="Search products" className="flex flex-1 gap-2 sm:max-w-md">
          <Input
            key={params.q}
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="Search by name or id"
            aria-label="Search by name or id"
            className="h-11 rounded-xl"
          />
          <Button type="submit" variant="outline" className="h-11 rounded-xl px-4">
            <Search aria-hidden /> Search
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Show"
            className={cn(selectClass, "w-auto")}
            value={params.status}
            onChange={(event) => router.replace(href({ status: event.target.value as ProductListParams["status"] }))}
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
            onChange={(event) => router.replace(href({ sort: event.target.value as ProductListParams["sort"] }))}
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button asChild size="lg" className="h-11 rounded-xl px-4">
            <Link href="/admin/products/new">
              <Plus aria-hidden /> New product
            </Link>
          </Button>
        </div>
      </div>

      {isPending ? (
        <Skeleton aria-busy aria-label="Loading products" className="h-80 rounded-2xl" />
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
            <Shirt aria-hidden className="text-muted-foreground size-6" />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-medium">No products found</h2>
            <p className="text-muted-foreground text-sm">Try another search, or add a product.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4" aria-busy={isFetching}>
          <div className="border-border rounded-2xl border">
            <Table>
              <TableCaption>Products</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16">Photo</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Image
                        src={product.image.thumb_400}
                        alt=""
                        width={400}
                        height={533}
                        sizes="48px"
                        className="bg-muted h-14 w-11 rounded-lg object-cover"
                      />
                    </TableCell>
                    <TableCell className="max-w-64 min-w-40">
                      <Link href={`/admin/products/${product.id}`} className="line-clamp-2 font-medium hover:underline">
                        {product.name}
                      </Link>
                      <span className="text-muted-foreground text-xs">#{product.id}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{product.article_type}</TableCell>
                    <TableCell className="text-right">
                      <Price cents={product.price_cents} currency={product.currency} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{product.stock_quantity}</TableCell>
                    <TableCell>
                      {product.is_active ? <Badge variant="secondary">On sale</Badge> : <Badge variant="destructive">Withdrawn</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" className="h-9 rounded-lg px-3">
                          <Link href={`/admin/products/${product.id}`} aria-label={`Edit ${product.name}`}>
                            <Pencil aria-hidden /> Edit
                          </Link>
                        </Button>
                        {product.is_active ? (
                          <Button
                            variant="outline"
                            className="h-9 rounded-lg px-3"
                            aria-label={`Withdraw ${product.name}`}
                            onClick={() => setWithdrawing(product)}
                          >
                            Withdraw
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="h-9 rounded-lg px-3"
                            aria-label={`Restore ${product.name}`}
                            disabled={setActive.isPending}
                            onClick={() =>
                              setActive.mutate(
                                { id: product.id, active: true },
                                { onSuccess: () => toast.success("Product is back on sale.") },
                              )
                            }
                          >
                            <RotateCcw aria-hidden /> Restore
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ListPagination
            label="Products pages"
            page={data.page}
            pages={data.pages}
            total={data.total}
            hrefFor={(page) => href({ page })}
          />
        </div>
      )}

      <Dialog open={withdrawing !== null} onOpenChange={(open) => !open && setWithdrawing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this product?</DialogTitle>
            <DialogDescription>
              {withdrawing ? `${withdrawing.name}. ` : ""}It disappears from the store, search and similar items.
              Existing orders keep it, and you can restore it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawing(null)}>
              Keep it on sale
            </Button>
            <Button
              variant="destructive"
              disabled={setActive.isPending}
              onClick={() => {
                if (!withdrawing) return;
                const { id } = withdrawing;
                setActive.mutate(
                  { id, active: false },
                  { onSuccess: () => toast.success("Product withdrawn.") },
                );
                setWithdrawing(null);
              }}
            >
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
