import type { Metadata } from "next";
import { AdminOrderView } from "@/features/admin/orders-views";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[number]">) {
  return <AdminOrderView number={(await params).number} />;
}
