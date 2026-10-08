import type { Metadata } from "next";
import { OrdersList } from "@/features/orders/orders-list";

export const metadata: Metadata = { title: "Your orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/account/orders">) {
  const raw = Number((await searchParams).page);
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 10_000 ? raw : 1;
  return <OrdersList page={page} />;
}
