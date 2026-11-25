import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { parseOrderParams } from "@/features/admin/list-params";
import { OrdersTable } from "@/features/admin/orders-views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("orders") };
}

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return <OrdersTable params={parseOrderParams(await searchParams)} />;
}
