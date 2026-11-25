import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrdersList } from "@/features/orders/orders-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.meta");
  return { title: t("orders") };
}

export default async function OrdersPage({ searchParams }: PageProps<"/account/orders">) {
  const raw = Number((await searchParams).page);
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 10_000 ? raw : 1;
  return <OrdersList page={page} />;
}
