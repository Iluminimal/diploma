import type { Metadata } from "next";
import { parseProductParams } from "@/features/admin/list-params";
import { ProductsTable } from "@/features/admin/products-table";

export const metadata: Metadata = { title: "Products" };

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return <ProductsTable params={parseProductParams(await searchParams)} />;
}
