import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { parseProductParams } from "@/features/admin/list-params";
import { ProductsTable } from "@/features/admin/products-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("products") };
}

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return <ProductsTable params={parseProductParams(await searchParams)} />;
}
