import type { Metadata } from "next";
import { OrderPageView } from "@/features/orders/order-page-view";

export const metadata: Metadata = { title: "Order details" };

export default async function OrderPage({ params }: PageProps<"/account/orders/[number]">) {
  return <OrderPageView number={(await params).number} />;
}
