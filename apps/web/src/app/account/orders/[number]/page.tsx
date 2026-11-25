import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrderPageView } from "@/features/orders/order-page-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.meta");
  return { title: t("order") };
}

export default async function OrderPage({ params }: PageProps<"/account/orders/[number]">) {
  return <OrderPageView number={(await params).number} />;
}
