import type { Metadata } from "next";
import { parseOrderParams } from "@/features/admin/list-params";
import { OrdersTable } from "@/features/admin/orders-views";

export const metadata: Metadata = { title: "Orders" };

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return <OrdersTable params={parseOrderParams(await searchParams)} />;
}
