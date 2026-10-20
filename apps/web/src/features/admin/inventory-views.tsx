"use client";

import { Search, Warehouse } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminProduct, ProductListParams } from "./admin-api";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { AdminPageHeader } from "./page-header";
import { useAdminProducts, useSetStock } from "./use-admin";

const DEFAULTS = { q: "", stock: "all", page: 1 };
const TABS: { stock: ProductListParams["stock"]; label: string }[] = [
  { stock: "all", label: "All on sale" },
  { stock: "low", label: "Low stock" },
  { stock: "out", label: "Sold out" },
];
const MAX_STOCK = 100_000;

/**
 * Тавиур дээр хэд байгааг тохируулна. Өөрчлөлт биш, өгсөн тоог шууд бичдэг тул хоёр хүн дахин
 * тоолоход давхардахгүй.
 */
function StockEditor({ product }: { product: AdminProduct }) {
  const setStock = useSetStock();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(new FormData(event.currentTarget).get("quantity"));
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_STOCK) {
      toast.error(`Enter a whole number from 0 to ${MAX_STOCK.toLocaleString("en-US")}.`);
      return;
    }
    if (quantity === product.stock_quantity) return;
    setStock.mutate({ id: product.id, quantity }, { onSuccess: () => toast.success(`${product.name}: ${quantity} in stock.`) });
  };
  return (
    <form onSubmit={submit} className="flex items-center justify-end gap-2" aria-label={`Stock of ${product.name}`}>
      <Input
        // Серверээс ирсэн шинэ тоо бичсэн утгыг орлоно.
        key={product.stock_quantity}
        name="quantity"
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_STOCK}
        step={1}
        defaultValue={product.stock_quantity}
        aria-label={`Units in stock of ${product.name}`}
        className="h-9 w-24 rounded-lg text-right tabular-nums"
      />
      <Button type="submit" variant="outline" className="h-9 rounded-lg px-3" disabled={setStock.isPending}>
        Save
      </Button>
    </form>
  );
}

export function InventoryTable({ params }: { params: ProductListParams }) {
  const router = useRouter();
  const { data, isPending, error, refetch, isFetching } = useAdminProducts(params);
  const href = (change: Partial<ProductListParams>) =>
    `/admin/inventory${toQuery({ q: params.q, stock: params.stock, page: 1, ...change }, DEFAULTS)}`;

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.replace(href({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim() }));
  };

  return (
    <div>
      <AdminPageHeader title="Inventory" description="How many of each product are on the shelf, lowest first." />
      <div className="space-y-6">
        <nav aria-label="Stock level" className="-mx-1 overflow-x-auto px-1 pb-1">
          <ul className="flex gap-1">
            {TABS.map(({ stock, label }) => (
              <li key={stock} className="shrink-0">
                <Link
                  href={href({ stock })}
                  aria-current={params.stock === stock ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring/60 inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium outline-none focus-visible:ring-3",
                    params.stock === stock ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <form onSubmit={search} role="search" aria-label="Search inventory" className="flex gap-2 sm:max-w-md">
          <Input
            key={params.q}
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="Search by name or id"
            aria-label="Search by name or id"
            className="h-11 rounded-xl"
          />
          <Button type="submit" variant="outline" className="h-11 rounded-full px-4">
            <Search aria-hidden /> Search
          </Button>
        </form>

        {isPending ? (
          <Skeleton aria-busy aria-label="Loading inventory" className="h-80 rounded-2xl" />
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
              <Warehouse aria-hidden className="text-muted-foreground size-6" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-medium">
                {params.stock === "low" ? "Nothing is running low" : params.stock === "out" ? "Nothing is sold out" : "No products found"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {params.q ? "Try another search." : "Products that need restocking show up here."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4" aria-busy={isFetching}>
            <div className="border-border bg-background rounded-[var(--radius-tile)] border">
              <Table>
                <TableCaption>Products on sale, lowest stock first</TableCaption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16">Photo</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
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
                        {product.stock_quantity === 0 && (
                          <Badge variant="destructive" className="ml-2">
                            Sold out
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{product.article_type}</TableCell>
                      <TableCell>
                        <StockEditor product={product} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ListPagination label="Inventory pages" page={data.page} pages={data.pages} total={data.total} hrefFor={(page) => href({ page })} />
          </div>
        )}
      </div>
    </div>
  );
}
