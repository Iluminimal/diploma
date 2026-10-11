import "server-only";
import { listProducts } from "@/features/catalog/api";
import { emptyFilters, type ListingQuery } from "@/features/catalog/filters";
import type { Product } from "@/features/catalog/product";

/** In-stock products, newest first, narrowed by `patch`. A failed request is "no products": the page still renders. */
export async function newest(patch: Partial<ListingQuery>, count: number): Promise<Product[]> {
  try {
    const { items } = await listProducts({ ...emptyFilters(), page: 1, in_stock: true, sort: "newest", ...patch }, count);
    return items;
  } catch {
    return [];
  }
}
